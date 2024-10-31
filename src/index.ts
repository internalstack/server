import { nanoid } from 'nanoid'
import { safeDestr } from 'destr'
import { ofetch } from 'ofetch'
import { EventEmitter } from 'node:events'
import { consola } from 'consola'
import { omit } from 'lodash-es'
import {
	jsonValueValidator,
	type GoogleMapsAutocompleteResultSchema,
	type GoogleMapsAutocompletePredictionsSchema,
} from './validators'
import {
	ConstantBackoff,
	ArrayQueue,
	WebsocketBuilder,
	WebsocketEvent,
} from 'websocket-ts'

const eventEmitter = new EventEmitter()

const waitForEvent = async <EventData>(
	eventName: string,
	callback?: () => void,
): Promise<EventData> => {
	return new Promise((resolve) => {
		eventEmitter.once(eventName, (data) => {
			if (callback) {
				callback()
			}
			resolve(data)
		})
	})
}

type JsonValue = string | number | boolean | null | JsonArray | JsonObject
type JsonArray = Array<JsonValue>
type JsonObject = {
	[key: string]: JsonValue
}
type SessionInit = {
	action: 'startSession'
	sessionId: string
	user: string
}
type Patch = {
	action: 'patch'
	fieldId: string
	sessionId: string
	data: unknown
}
type Field = {
	action: 'render' | 'warn' | 'complete' | 'resolve'
	fieldId: string
	sessionId: string
	fieldValue: unknown
}
const safeParse = <T>(maybeJson: string) => {
	try {
		return safeDestr<T>(maybeJson)
	} catch {
		return false
	}
}

const eventId = (sessionId: string, fieldId: string, type: 'patch' | 'resolve') => {
	return `${sessionId}:${fieldId}:${type}`
}

export const internalStack = async (
	apiKey: string,
	options?: { verbose?: boolean },
) => {
	const ws = new WebsocketBuilder(
		`wss://v1.internalstack.com/websocket?apiKey=${apiKey}`,
	)
		.withBuffer(new ArrayQueue()) // buffer messages when disconnected
		.withBackoff(new ConstantBackoff(1000))
		.build()
	if (options?.verbose !== false) {
		ws.addEventListener(WebsocketEvent.reconnect, () =>
			consola.info('Reconnected'),
		)
		ws.addEventListener(WebsocketEvent.retry, () =>
			consola.info('Reconnecting...'),
		)
		ws.addEventListener(WebsocketEvent.error, (_websocket, e) => {
			consola.fatal(e)
			throw 'Fatal error' // Automatically reload server via process manager like PM2
		})
		ws.addEventListener(WebsocketEvent.open, () =>
			consola.success('Connected to InternalStack Cloud'),
		)
		ws.addEventListener(WebsocketEvent.close, () =>
			consola.fail('Disconnected'),
		)
	}
	ws.addEventListener(
		WebsocketEvent.message,
		async (_websocket, rawMessage) => {
			const message = safeParse<Message>(rawMessage.data.toString())
			if (!message) return
			console.log(message)
			if (message.action === 'startSession') {
				eventEmitter.emit('startSession', {
					sessionId: message.sessionId,
					user: message.user,
				})
				ws.send(
					JSON.stringify({
						action: 'updatePeers',
					}),
				)
			}
			if (message.action === 'patch') {
				eventEmitter.emit(
					eventId(message.sessionId, message.fieldId, 'patch'),
					message.data,
				)
			}
			if (message.action === 'resolve') {
				const customValidator = fieldValidators.get(message.fieldId)
				if (!customValidator) {
					fieldValidators.delete(message.fieldId)
					eventEmitter.emit(
						eventId(message.sessionId, message.fieldId, 'resolve'),
						message.fieldValue,
					)
				} else {
					const validationResult = await customValidator(message.fieldValue)
					ws.send(
						JSON.stringify({
							validationResult,
							action: 'warn',
							fieldId: message.fieldId,
							sessionId: message.sessionId,
						}),
					)
					if (validationResult === true) {
						fieldValidators.delete(message.fieldId)
						eventEmitter.emit(
							eventId(message.sessionId, message.fieldId, 'resolve'),
							message.fieldValue,
						)
					}
				}
			}
		},
	)
	const fieldValidators = new Map<
		string,
		(input: unknown) => Promise<string | true>
	>()
	setInterval(() => {
		ws.send('ping')
	}, 1000)
	ws.send(
		JSON.stringify({
			action: 'updatePeers',
		}),
	)
	const renderFieldInForm = (
		sessionId: string,
		params: {
			cachedFieldId?: string
			[key: string]: unknown
		},
	) => {
		const fieldId = params.cachedFieldId || `field_${nanoid()}`
		ws.send(
			JSON.stringify({
				...params,
				action: 'render',
				fieldId,
				sessionId,
			}),
		)
		return fieldId
	}

	type Message = SessionInit | Field | Patch

	const elements = (sessionId: string, isStandalone: boolean) => {
		return {
			input: {
				text: async (
					label: string,
					options?: {
						defaultValue?: string
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						label,
						type: 'text',
					})
					const defaultCustomValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultCustomValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				number: async (
					label: string,
					options?: {
						max?: number
						min?: number
						step?: number
						defaultValue?: number
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<number> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'number',
						label,
						number: true,
					})
					const defaultCustomValidator = async (input: unknown) => {
						if (typeof input !== 'number') return 'Invalid number'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultCustomValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				currency: async (
					label: string,
					options?: {
						defaultValue?: string
						displayLocale?: string
						currency?: string
						decimals?: number
						valueFormat?: 'number' | 'string'
						step?: number
						min?: number
						max?: number
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const defaultCustomValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Invalid string'
						if (!input) return 'Required'
						return true
					}
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'currency',
						label,
						decimals: undefined,
						minDecimals: options?.decimals || 2,
					})
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultCustomValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				markdown: async (
					label: string,
					options?: {
						defaultValue?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'markdown',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				richText: async (
					label: string,
					options?: {
						defaultValue?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'richText',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (input === '<p></p>') return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				slider: async (
					label: string,
					options?: {
						markLabels?: boolean
						marks?:
							| boolean
							| {
									at: number
									label: string
								}[]
						snapToMarks?: boolean
						max?: number
						min?: number
						step?: number
						defaultValue?: number
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<number> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'slider',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'number') return 'Invalid number'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				email: async (
					label: string,
					options?: {
						defaultValue?: string
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'email',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						return input.includes('@') || 'Invalid email address'
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				checkbox: async (
					label: string,
					options?: {
						defaultValue?: boolean
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<boolean> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'checkbox',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'boolean') return 'Expected boolean'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				checkboxes: async <T = JsonValue>(
					label: string,
					items: Array<{
						value: JsonValue
						label: string
						help?: string
						disabled?: boolean
					}>,
					options?: {
						disabled?: boolean
						help?: string
						defaultValue?: boolean
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const boxes = items.map((box) => {
						if (box.disabled) {
							return {
								label: box.label,
								help: box.help,
								value: box.value,
								attrs: { disabled: true },
							}
						}
						return box
					})
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'checkbox',
						label,
						options: boxes,
					})
					const defaultValidator = async (input: unknown) => {
						if (!Array.isArray(input)) return 'Expected array'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				radio: async <T = JsonValue>(
					label: string,
					items: Array<{
						value: JsonValue
						label: string
						help?: string
						disabled?: boolean
					}>,
					options?: {
						defaultValue?: JsonValue
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const boxes = items.map((radio) => {
						if (radio.disabled) {
							return {
								label: radio.label,
								help: radio.help,
								value: radio.value,
								attrs: { disabled: true },
							}
						}
						return radio
					})
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'radio',
						label,
						options: boxes,
					})
					const defaultValidator = async (input: unknown) => {
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				select: async <T = JsonValue>(
					label: string,
					items: Array<{
						value: JsonValue
						label: string
						disabled?: boolean
					}>,
					options?: {
						defaultValue?: JsonValue
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const selectOptions = items.map((select) => {
						if (select.disabled) {
							return {
								label: select.label,
								value: select.value,
								attrs: { disabled: true },
							}
						}
						return select
					})
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'select',
						label,
						options: selectOptions,
					})
					const defaultValidator = async (input: unknown) => {
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				autocomplete: async <T = JsonValue>(
					label: string,
					query: (input: string) => Promise<
						Array<
							| string
							| {
									label: string
									value: JsonObject
								}
						>
					>,
					options?: {
						selectionAppearance?: 'text-input' | 'option'
						defaultValue?: string
						multiple?: boolean
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'autocomplete',
						label,
					})
					eventEmitter.on(
						eventId(sessionId, renderedFieldId, 'patch'),
						async (data) => {
							ws.send(
								JSON.stringify({
									patchedState: await query(data),
									action: 'patch',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						},
					)
					const defaultValidator = async (input: unknown) => {
						if (input === null) return 'Required'
						const result = jsonValueValidator.safeParse(input)
						if (result.success) return true
						return result.error.issues[0].message
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						eventEmitter.removeAllListeners(
							eventId(sessionId, renderedFieldId, 'patch'),
						)
					})
				},
				address: async <T = GoogleMapsAutocompleteResultSchema>(
					label: string,
					googleMapsApiKey: string,
					options?: {
						pick?: (result: GoogleMapsAutocompleteResultSchema) => T
						selectionAppearance?: 'text-input' | 'option'
						defaultValue?: string
						disabled?: boolean
						help?: string
						placeholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, ['customValidator', 'pick']),
						type: 'autocomplete',
						label,
					})
					const addressAutocompleteOptions = async (
						input: string,
						apiKey: string,
					) => {
						const result =
							await ofetch<GoogleMapsAutocompletePredictionsSchema>(
								'https://maps.googleapis.com/maps/api/place/autocomplete/json',
								{
									query: {
										input,
										key: apiKey,
									},
								},
							)
						if (!googleMapsApiKey) {
							ws.send(
								JSON.stringify({
									validationResult: 'Missing Google Maps API key',
									action: 'warn',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
						return result.predictions.map((p) => ({
							label: p.description,
							value: p,
						}))
					}
					eventEmitter.on(
						eventId(sessionId, renderedFieldId, 'patch'),
						async (data) => {
							ws.send(
								JSON.stringify({
									patchedState: await addressAutocompleteOptions(
										data,
										googleMapsApiKey,
									),
									action: 'patch',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						},
					)
					const defaultValidator = async (input: unknown) => {
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					const result = await waitForEvent<GoogleMapsAutocompleteResultSchema>(
						eventId(sessionId, renderedFieldId, 'resolve'),
						() => {
							eventEmitter.removeAllListeners(
								eventId(sessionId, renderedFieldId, 'patch'),
							)
						},
					)
					return options?.pick ? options.pick(result) : result as T
				},
				date: async (
					label: string,
					options?: {
						defaultValue?: string
						max?: string
						min?: string
						step?: number
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'date',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				datetimeLocal: async (
					label: string,
					options?: {
						defaultValue?: string
						max?: string
						min?: string
						step?: number
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'datetime-local',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				time: async (
					label: string,
					options?: {
						defaultValue?: string
						max?: string
						min?: string
						step?: number
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'time',
						label,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				colorpicker: async (
					label: string,
					options?: {
						defaultValue?: string
						disabled?: boolean
						help?: string
						format?: 'hex' | 'hsla' | 'rgba'
						outputFormat?: 'hex' | 'hsla' | 'rgba'
						eyeDropper?: boolean
						alpha?: boolean
						inline?: boolean
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<string> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'colorpicker',
						label,
						inline: options?.inline || true,
					})
					const defaultValidator = async (input: unknown) => {
						if (typeof input !== 'string') return 'Expected string'
						if (!input) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
				table: async <T = JsonArray>(
					label: string,
					query: (input: {
						query: string
						page: number
						offset: number
						pageSize: number
					}) => Promise<{
						resultsToDisplay: Array<JsonValue>
						totalResults: number
					}>,
					options?: {
						defaultValue?: Array<JsonValue>
						resultsPerPage?: number
						filterable?: boolean
						columns?: Array<{
							key: string
							label: string
							sortable?: boolean
							direction?: 'asc' | 'desc'
						}>
						filterPlaceholder?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const { resultsToDisplay, totalResults } = await query({
						page: 1,
						query: '',
						offset: 0,
						pageSize: options?.resultsPerPage || 10,
					})
					const renderedFieldId = renderFieldInForm(sessionId, {
						...omit(options, 'customValidator'),
						type: 'table',
						filterable: options?.filterable,
						label,
					})
					if (options?.filterable) {
						eventEmitter.on(
							eventId(sessionId, renderedFieldId, 'patch'),
							async (data) => {
								const offset = (data.page - 1) * (options?.resultsPerPage || 10)
								ws.send(
									JSON.stringify({
										patchedState: await query({
											query: data.query,
											page: data.page,
											offset,
											pageSize: options?.resultsPerPage || 10,
										}),
										action: 'patch',
										fieldId: renderedFieldId,
										sessionId,
									}),
								)
							},
						)
					}
					const defaultValidator = async (input: unknown) => {
						if (!Array.isArray(input)) return 'Expected array'
						if (input.length === 0) return 'Required'
						return true
					}
					fieldValidators.set(renderedFieldId, options?.customValidator || defaultValidator)
					return await waitForEvent(eventId(sessionId, renderedFieldId, 'resolve'), () => {
						if (isStandalone) {
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						}
					})
				},
			},
			display: {
				progress: async (
					label: string,
					options?: {
						description?: string
						max?: number
						indicator?: boolean
					},
				): Promise<{ increment: () => void; destroy: () => void }> => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						type: 'progress',
						defaultValue: 0,
						label,
						description: options?.description,
						max: options?.max || 100,
						indicator: options?.indicator || false,
					})
					let counter = 0
					const increment = () => {
						counter += 1
						ws.send(
							JSON.stringify({
								patchedState: counter,
								action: 'patch',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					const destroy = () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					return { increment, destroy }
				},
				loading: async (
					label: string,
					options?: {
						description?: string
						icon?: 'spinner' | 'check'
					},
				) => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						type: 'loading',
						label,
						description: options?.description,
						icon: options?.icon || 'spinner',
					})
					const updateMessage = (message: {
						icon?: 'spinner' | 'check'
						label?: string
						description?: string
					}) => {
						ws.send(
							JSON.stringify({
								patchedState: message,
								action: 'patch',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					const destroy = () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					return { updateMessage, destroy }
				},
				heading: async (
					text: string,
				) => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						type: 'heading',
						text,
					})
					const destroy = () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					return { destroy }
				},
				paragraph: async (
					text: string,
				) => {
					const renderedFieldId = renderFieldInForm(sessionId, {
						type: 'paragraph',
						text,
					})
					const destroy = () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					}
					return { destroy }
				},
			},
		}
	}
	type DisplayElementsObject = ReturnType<typeof elements>['display']
	type DisplayElements = DisplayElementsObject[keyof DisplayElementsObject]
	type InputElementsObject = ReturnType<typeof elements>['input']
	type InputElements = InputElementsObject[keyof InputElementsObject]
	type GroupElements = InputElements | DisplayElements
	type PageElementPromises = ReturnType<GroupElements>
	const sessionHandler = (sessionId: string) => {
		const standaloneElements = elements(sessionId, true)
		const pageElements = elements(sessionId, false)
		return {
			...standaloneElements,
			group: async <T>(groupElements: (group: typeof pageElements) => Array<PageElementPromises>) => {
				const elementPromises = groupElements(pageElements)
				const groupId = `group_${nanoid()}`
				setImmediate(async() => {
					const results = await Promise.all(elementPromises)
					eventEmitter.emit(
						`${sessionId}:${groupId}`,
						results,
					)
				})
				return await waitForEvent(`${sessionId}:${groupId}`, () => {
					ws.send(
						JSON.stringify({
							action: 'groupComplete',
							sessionId: sessionId,
						}),
					)
				}) as T
			}
		}
	}
	type IO = ReturnType<typeof sessionHandler>
	return {
		statefulSession: (
			callback: (
				io: IO,
				sessionInfo: {
					user: string
					sessionId: string
				},
			) => Promise<void>,
		) => {
			eventEmitter.on(
				'startSession',
				async (ctx: {
					sessionId: string
					user: string
				}) => {
					ws.send(
						JSON.stringify({
							action: 'updatePeers',
						}),
					)
					const io = sessionHandler(ctx.sessionId)
					await callback(io, ctx)
					ws.send(
						JSON.stringify({
							action: 'complete',
							sessionId: ctx.sessionId,
						}),
					)
				},
			)
			setInterval(() => 1000)
		},
	}
}

