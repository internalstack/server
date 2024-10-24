import { nanoid } from 'nanoid'
import { safeDestr } from 'destr'
import { ofetch } from 'ofetch'
import { EventEmitter } from 'node:events'
import { consola } from 'consola'
import { z } from 'zod'
import {
	validators,
	type GoogleMapsAutocompleteResultSchema,
	type GoogleMapsAutocompletePredictionsSchema,
} from './validators'
import {
	ConstantBackoff,
	ArrayQueue,
	WebsocketBuilder,
	WebsocketEvent,
} from 'websocket-ts'
const sessionStepStates = new Map<
	string,
	{
		parameters: { [key: string]: unknown }
		fieldId: string
	}
>()
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

type Field<FieldValueType> = {
	value: FieldValueType
	disabled: boolean
	help: string
	placeholder: string
	label: string
	type: 'email' | 'number'
	action: 'render' | 'warn' | 'complete' | 'resolve'
	fieldId: string
	fieldValue: FieldValueType
	sessionId: string
}

type JsonValue = string | number | boolean | null | JsonArray | JsonObject

type JsonArray = Array<JsonValue>

type JsonObject = {
	[key: string]: JsonValue
}

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(z.lazy(() => jsonValue)),
		z.record(
			z.string(),
			z.lazy(() => jsonValue),
		),
	]),
)

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
const safeParse = <T>(maybeJson: string) => {
	try {
		return safeDestr<T>(maybeJson)
	} catch {
		return false
	}
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
					`${message.sessionId}:${message.fieldId}:patch`,
					message.data,
				)
			}
			if (message.action === 'resolve') {
				const customValidator = fieldValidators.get(message.fieldId)
				if (!customValidator) {
					fieldValidators.delete(message.fieldId)
					eventEmitter.emit(
						`${message.fieldId}:${message.sessionId}`,
						message.fieldValue,
					)
				} else {
					const validationResult = await customValidator(message.fieldValue)
					if (validationResult === true) {
						fieldValidators.delete(message.fieldId)
						eventEmitter.emit(
							`${message.fieldId}:${message.sessionId}`,
							message.fieldValue,
						)
					} else {
						ws.send(
							JSON.stringify({
								validationResult,
								action: 'warn',
								fieldId: message.fieldId,
								sessionId: message.sessionId,
							}),
						)
					}
				}
			}
		},
	)
	const fieldValidators = new Map<
		string,
		(input: unknown) => Promise<unknown | true>
	>()
	setInterval(() => {
		ws.send('ping')
	}, 1000)
	ws.send(
		JSON.stringify({
			action: 'updatePeers',
		}),
	)
	type FieldType = keyof typeof validators
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

	type Message = Field<string> | SessionInit | Field<number> | Patch

	const fieldHandler = (sessionId: string) => {
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
					const type = 'text'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'number'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						number: true,
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'currency'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
						decimals: undefined,
						minDecimals: validOptions.decimals,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'markdown'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'richText'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'slider'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'email'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'checkbox'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					})
				},
				checkboxes: async <T = JsonValue>(
					label: string,
					items: Array<{
						value: JsonValue
						label: string
						checkedByDefault?: boolean
						help?: string
						disabled?: boolean
					}>,
					options?: {
						disabled?: boolean
						help?: string
						customValidator?: (input: unknown) => Promise<string | true>
					},
				): Promise<T> => {
					const type = 'checkboxes'
					const validItems = validators[type].items.parse(items)
					const validOptions = validators[type].options.parse(options)
					const defaultValue: Array<(typeof items)[number]['value']> = []
					const boxes = validItems.map((box) => {
						if (box.checkedByDefault) {
							defaultValue.push(box.value)
						}
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
					const parameters = {
						type: 'checkbox',
						label: validators[type].label.parse(label),
						...validOptions,
						options: boxes,
						defaultValue,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'radio'
					const validItems = validators[type].items.parse(items)
					const validOptions = validators[type].options.parse(options)
					const boxes = validItems.map((radio) => {
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
					const parameters = {
						type: 'radio',
						label: validators[type].label.parse(label),
						...validOptions,
						options: boxes,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'select'
					const validItems = validators[type].items.parse(items)
					const validOptions = validators[type].options.parse(options)
					const selectOptions = validItems.map((select) => {
						if (select.disabled) {
							return {
								label: select.label,
								value: select.value,
								attrs: { disabled: true },
							}
						}
						return select
					})
					const parameters = {
						type: 'select',
						label: validators[type].label.parse(label),
						...validOptions,
						options: selectOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
					})
				},
				autocomplete: async <T = JsonValue>(
					label: string,
					query: (input: string) => Promise<
						Array<
							| string
							| {
									label: string
									value: JsonArray
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
					const type = 'autocomplete'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					eventEmitter.on(
						`${sessionId}:${renderedFieldId}:patch`,
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
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						eventEmitter.removeAllListeners(
							`${sessionId}:${renderedFieldId}:patch`,
						)
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
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
					const type = 'address'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: 'autocomplete',
						label: validators[type].label.parse(label),
						...validOptions,
						pick: undefined,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
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
						`${sessionId}:${renderedFieldId}:patch`,
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
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					const result = await waitForEvent<GoogleMapsAutocompleteResultSchema>(
						`${renderedFieldId}:${sessionId}`,
						() => {
							eventEmitter.removeAllListeners(
								`${sessionId}:${renderedFieldId}:patch`,
							)
							ws.send(
								JSON.stringify({
									action: 'destroy',
									fieldId: renderedFieldId,
									sessionId,
								}),
							)
						},
					)
					return validOptions.pick(result)
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
					const type = 'date'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'datetimeLocal'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: 'datetime-local',
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, {
						...parameters,
						type: 'datetimeLocal',
					})
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'time'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'colorpicker'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'table'
					const validOptions = validators[type].options.parse(options)
					validators[type].query.parse(query)
					const filterable = true
					const { resultsToDisplay, totalResults } = await query({
						page: 1,
						query: '',
						offset: 0,
						pageSize: validOptions.resultsPerPage,
					})
					const parameters = {
						type,
						filterable,
						label: validators[type].label.parse(label),
						rows: resultsToDisplay,
						totalResultCount: totalResults,
						...validOptions,
						rowsPerPage: validOptions.resultsPerPage,
						columns:
							validOptions.columns.length > 0
								? validOptions.columns
								: undefined,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
					if (filterable) {
						eventEmitter.on(
							`${sessionId}:${renderedFieldId}:patch`,
							async (data) => {
								const offset = (data.page - 1) * validOptions.resultsPerPage
								ws.send(
									JSON.stringify({
										patchedState: await query({
											query: data.query,
											page: data.page,
											offset,
											pageSize: validOptions.resultsPerPage,
										}),
										action: 'patch',
										fieldId: renderedFieldId,
										sessionId,
									}),
								)
							},
						)
					}
					fieldValidators.set(renderedFieldId, validOptions.customValidator)
					sessionStepStates.set(sessionId, {
						parameters,
						fieldId: renderedFieldId,
					})
					return await waitForEvent(`${renderedFieldId}:${sessionId}`, () => {
						ws.send(
							JSON.stringify({
								action: 'destroy',
								fieldId: renderedFieldId,
								sessionId,
							}),
						)
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
					const type = 'progress'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						defaultValue: 0,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
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
					const type = 'loading'
					const validOptions = validators[type].options.parse(options)
					const parameters = {
						type: type,
						label: validators[type].label.parse(label),
						...validOptions,
					} as const
					const renderedFieldId = renderFieldInForm(sessionId, parameters)
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
			},
		}
	}
	type IO = ReturnType<typeof fieldHandler>
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
					if (sessionStepStates.has(ctx.sessionId)) {
						const stepState = sessionStepStates.get(ctx.sessionId)
						if (stepState) {
							const { parameters, fieldId } = stepState
							renderFieldInForm(ctx.sessionId, {
								...parameters,
								cachedFieldId: fieldId,
							})
							return
						}
					}
					ws.send(
						JSON.stringify({
							action: 'updatePeers',
						}),
					)
					const io = fieldHandler(ctx.sessionId)
					await callback(io, ctx)
					sessionStepStates.delete(ctx.sessionId)
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

export { validators }
type ValidatorsObject = typeof validators
export type { ValidatorsObject }
