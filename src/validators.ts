import { z } from 'zod'

const googleMapsAutocompleteResultSchema = z.object({
  description: z.string(),
  matched_substrings: z.array(
    z.object({ length: z.number(), offset: z.number() })
  ),
  place_id: z.string(),
  reference: z.string(),
  structured_formatting: z.object({
    main_text: z.string(),
    main_text_matched_substrings: z.array(
      z.object({ length: z.number(), offset: z.number() })
    ),
    secondary_text: z.string()
  }),
  terms: z.array(z.object({ offset: z.number(), value: z.string() })),
  types: z.array(z.string())
})
export type GoogleMapsAutocompleteResultSchema = z.infer<typeof googleMapsAutocompleteResultSchema>
const googleMapsAutocompletePredictionsSchema = z.object({
  predictions: z.array(
    z.object({
      description: z.string(),
      matched_substrings: z.array(
        z.object({
          length: z.number(),
          offset: z.number()
        })
      ),
      place_id: z.string(),
      reference: z.string(),
      structured_formatting: z.object({
        main_text: z.string(),
        main_text_matched_substrings: z.array(
          z.object({
            length: z.number(),
            offset: z.number()
          })
        ),
        secondary_text: z.string()
      }),
      terms: z.array(
        z.object({
          offset: z.number(),
          value: z.string()
        })
      ),
      types: z.array(z.string())
    })
  ),
  status: z.string()
})


export type GoogleMapsAutocompletePredictionsSchema = z.infer<typeof googleMapsAutocompletePredictionsSchema>
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonArray
  | JsonObject

type JsonArray = Array<JsonValue>

type JsonObject = {
  [key: string]: JsonValue
}

const jsonValueValidator: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.lazy(() => jsonValueValidator)),
    z.record(z.string(), z.lazy(() => jsonValueValidator)),
  ])
)

export const validators = {
  text: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  number: {
    label: z.string(),
    options: z.object({
      max: z.number().nullable().optional().default(null),
      min: z.number().nullable().optional().default(null),
      step: z.number().positive().nullable().optional().default(1),
      defaultValue: z.number().nullable().optional().default(0),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'number') return 'Invalid number'
            return true
          })),
    }).optional().default({})
  },
  currency: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default('0'),
      displayLocale: z.string().optional().default('en-US'),
      currency: z.string().optional().default('USD'),
      decimals: z.number().int().positive().optional().default(2),
      valueFormat: z.union([z.literal('number'), z.literal('string')]).optional().default('number'),
      step: z.number().optional().default(1),
      min: z.number().nullable().optional().default(null),
      max: z.number().nullable().optional().default(null),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Invalid string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  markdown: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  richText: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (input === '<p></p>') return 'Required'
            return true
          })),
    }).optional().default({})
  },
  slider: {
    label: z.string(),
    options: z.object({
      markLabels: z.boolean().optional().default(false),
      marks: z.union([
        z.boolean(),
        z.array(
          z.object({
            at: z.number(),
            label: z.string(),
          })
        )
      ])
        .optional().default(false),
      snapToMarks: z.boolean().optional().default(false),
      max: z.number().nullable().optional().default(null),
      min: z.number().nullable().optional().default(null),
      step: z.number().positive().nullable().optional().default(1),
      defaultValue: z.number().nullable().optional().default(0),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'number') return 'Invalid number'
            return true
          })),
    }).optional().default({})
  },
  email: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            return input.includes('@') || 'Invalid email address'
          })),
    }).optional().default({})
  },
  checkbox: {
    label: z.string(),
    options: z.object({
      defaultValue: z.boolean().optional().default(false),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'boolean') return 'Expected boolean'
            return true
          })),
    }).optional().default({})
  },
  checkboxes: {
    label: z.string(),
    items: z.array(z.object({
      value: jsonValueValidator,
      label: z.string(),
      checkedByDefault: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      disabled: z.boolean().optional().default(false),
    })),
    options: z.object({
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (!Array.isArray(input)) return 'Expected array'
            return true
          })),
    }).optional().default({})
  },
  radio: {
    label: z.string(),
    items: z.array(z.object({
      value: jsonValueValidator,
      label: z.string(),
      help: z.string().optional().default(''),
      disabled: z.boolean().optional().default(false),
    })),
    options: z.object({
      defaultValue: jsonValueValidator.nullable().optional().default(null),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  select: {
    label: z.string(),
    items: z.array(z.object({
      value: jsonValueValidator,
      label: z.string(),
      disabled: z.boolean().optional().default(false),
    })),
    options: z.object({
      defaultValue: jsonValueValidator.nullable().optional().default(null),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  autocomplete: {
    label: z.string(),
    query: z.function()
      .args(z.string())
      .returns(
        z.array(
          z.union([
            z.string(),
            z.object({
              label: z.string(),
              value: jsonValueValidator,
            })
          ])
        ).promise()
      ),
    options: z.object({
      selectionAppearance: z.union([
        z.literal('text-input'),
        z.literal('option'),
      ]).optional().default('text-input'),
      defaultValue: z.string().nullable().optional().default(null),
      multiple: z.boolean().optional().default(false),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (input === null) return 'Required'
            const result = jsonValueValidator.safeParse(input)
            if (result.success) return true
            return result.error.issues[0].message
          })),
    }).optional().default({})
  },
  address: {
    label: z.string(),
    googleMapsApiKey: z.string(),
    options: z.object({
      pick: z.function()
        .args(googleMapsAutocompleteResultSchema)
        .returns(z.any())
        .optional()
        .default(() => (async (input: GoogleMapsAutocompleteResultSchema) => {
          return input
        })),
      selectionAppearance: z.union([
        z.literal('text-input'),
        z.literal('option'),
      ]).optional().default('text-input'),
      defaultValue: z.string().nullable().optional().default(null),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      placeholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  date: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      max: z.string().nullable().optional().default(null),
      min: z.string().nullable().optional().default(null),
      step: z.number().positive().nullable().optional().default(1),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  datetimeLocal: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      max: z.string().nullable().optional().default(null),
      min: z.string().nullable().optional().default(null),
      step: z.number().positive().nullable().optional().default(1),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  time: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default(''),
      max: z.string().nullable().optional().default(null),
      min: z.string().nullable().optional().default(null),
      step: z.number().positive().nullable().optional().default(1),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  colorpicker: {
    label: z.string(),
    options: z.object({
      defaultValue: z.string().optional().default('#FFFFFF'),
      disabled: z.boolean().optional().default(false),
      help: z.string().optional().default(''),
      format: z.union([z.literal('hex'), z.literal('hsla'), z.literal('rgba')]).optional().default('hex'),
      outputFormat: z.union([z.literal('hex'), z.literal('hsla'), z.literal('rgba')]).optional().default('hex'),
      eyeDropper: z.boolean().optional().default(true),
      alpha: z.boolean().optional().default(true),
      inline: z.boolean().optional().default(false),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (typeof input !== 'string') return 'Expected string'
            if (!input) return 'Required'
            return true
          })),
    }).optional().default({})
  },
  progress: {
    label: z.string(),
    options: z.object({
      description: z.string().optional().default(''),
      max: z.number().optional().default(100),
      indicator: z.boolean().optional().default(false),
    }).optional().default({})
  },
  loading: {
    label: z.string(),
    options: z.object({
      description: z.string().optional().default(''),
      icon: z.union([
        z.literal('spinner'),
        z.literal('check'),
      ]).optional().default('spinner'),
    }).optional().default({})
  },
  table: {
    label: z.string(),
    query: z.function()
      .args(
        z.object({
          page: z.number().int().positive(),
          query: z.string(),
          offset: z.number().positive(),
          pageSize: z.number().positive(),
        })
      )
      .returns(
        z.object({
          resultsToDisplay: z.array(z.record(jsonValueValidator)),
          totalResults: z.number().positive(),
        }).promise()
      ),
    totalResultCount: z.number().int().positive(),
    options: z.object({
      defaultValue: z.array(jsonValueValidator).optional().default([]),
      resultsPerPage: z.number().int().positive().optional().default(100),
      columns: z.array(z.object({
        key: z.string(),
        label: z.string(),
        sortable: z.boolean().optional().default(false),
        direction: z.union([z.literal('asc'), z.literal('desc')]).optional().default('asc'),
      })).optional().default([]),
      filterPlaceholder: z.string().optional().default(''),
      customValidator: z
        .function()
        .args(z.unknown())
        .returns(
          z.union([
            z.string(),
            z.literal(true)
          ])
          .promise()
        )
          .optional()
          .default(() => (async (input: unknown) => {
            if (!Array.isArray(input)) return 'Expected array'
            if (input.length === 0) return 'Required'
            return true
          })),
    }).optional().default({}),
  },
}