import { z } from 'zod'

const googleMapsAutocompleteResultSchema = z.object({
	description: z.string(),
	matched_substrings: z.array(
		z.object({ length: z.number(), offset: z.number() }),
	),
	place_id: z.string(),
	reference: z.string(),
	structured_formatting: z.object({
		main_text: z.string(),
		main_text_matched_substrings: z.array(
			z.object({ length: z.number(), offset: z.number() }),
		),
		secondary_text: z.string(),
	}),
	terms: z.array(z.object({ offset: z.number(), value: z.string() })),
	types: z.array(z.string()),
})
export type GoogleMapsAutocompleteResultSchema = z.infer<
	typeof googleMapsAutocompleteResultSchema
>
const googleMapsAutocompletePredictionsSchema = z.object({
	predictions: z.array(
		z.object({
			description: z.string(),
			matched_substrings: z.array(
				z.object({
					length: z.number(),
					offset: z.number(),
				}),
			),
			place_id: z.string(),
			reference: z.string(),
			structured_formatting: z.object({
				main_text: z.string(),
				main_text_matched_substrings: z.array(
					z.object({
						length: z.number(),
						offset: z.number(),
					}),
				),
				secondary_text: z.string(),
			}),
			terms: z.array(
				z.object({
					offset: z.number(),
					value: z.string(),
				}),
			),
			types: z.array(z.string()),
		}),
	),
	status: z.string(),
})

export type GoogleMapsAutocompletePredictionsSchema = z.infer<
	typeof googleMapsAutocompletePredictionsSchema
>
type JsonValue = string | number | boolean | null | JsonArray | JsonObject

type JsonArray = Array<JsonValue>

type JsonObject = {
	[key: string]: JsonValue
}

export const jsonValueValidator: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(z.lazy(() => jsonValueValidator)),
		z.record(
			z.string(),
			z.lazy(() => jsonValueValidator),
		),
	]),
)
