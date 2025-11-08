import { z } from 'zod';

const latSchema = z
  .number({ invalid_type_error: 'Latitude must be a number' })
  .gte(-90, 'Latitude must be >= -90')
  .lte(90, 'Latitude must be <= 90');

const lngSchema = z
  .number({ invalid_type_error: 'Longitude must be a number' })
  .gte(-180, 'Longitude must be >= -180')
  .lte(180, 'Longitude must be <= 180');

export const CoordinatesSchema = z.object({
  lat: latSchema,
  lng: lngSchema
});

export const DestinationStopSchema = CoordinatesSchema.extend({
  id: z.string().min(1),
  label: z.string().min(1).optional()
});

const nonNegativeNumber = z
  .number({ invalid_type_error: 'Value must be a number' })
  .nonnegative('Value must be >= 0');

const matrixSchema = z
  .array(z.array(nonNegativeNumber).min(1))
  .min(1)
  .superRefine((rows, ctx) => {
    const columnCount = rows[0]?.length ?? 0;

    rows.forEach((row, rowIndex) => {
      if (row.length !== columnCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All rows in the matrix must have the same length',
          path: [rowIndex]
        });
      }
    });

    if (columnCount !== rows.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Matrix must be square (rows === columns)'
      });
    }
  });

export const DistanceMatrixSchema = z
  .object({
    meters: matrixSchema,
    seconds: matrixSchema
  })
  .superRefine((value, ctx) => {
    const meterRows = value.meters.length;
    const secondRows = value.seconds.length;

    if (meterRows !== secondRows) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meters and seconds must have the same dimensions'
      });
      return;
    }

    value.meters.forEach((row, rowIndex) => {
      if (row.length !== value.seconds[rowIndex]?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'meters and seconds rows must have the same length',
          path: ['seconds', rowIndex]
        });
      }
    });
  });

export const OptimizerOptionsSchema = z.object({
  strategy: z.enum(['fast', 'quality']).default('quality'),
  maxIterations: z.number().int().min(10).max(10_000).default(4_000),
  maxRuntimeSeconds: z.number().int().min(1).max(60).default(30),
  fallbackTolerance: z.number().min(0).max(1).default(0.15)
});

export const DEFAULT_OPTIMIZER_OPTIONS = OptimizerOptionsSchema.parse({});

export const OrderedStopSchema = CoordinatesSchema.extend({
  id: z.string().min(1),
  label: z.string().optional(),
  sequence: z.number().int().nonnegative(),
  distanceFromPreviousM: nonNegativeNumber,
  durationFromPreviousS: nonNegativeNumber,
  cumulativeDistanceM: nonNegativeNumber,
  cumulativeDurationS: nonNegativeNumber
});

export const DiagnosticsSchema = z.object({
  strategy: z.enum(['fast', 'quality']),
  solver: z.string().min(1),
  iterations: z.number().int().nonnegative(),
  gap: z.number().min(0).max(1),
  fallbackUsed: z.boolean(),
  executionMs: nonNegativeNumber
});

export const OptimizerRequestSchema = z.object({
  origin: CoordinatesSchema,
  destinations: z.array(DestinationStopSchema).min(1).max(30),
  distanceMatrix: DistanceMatrixSchema.optional(),
  options: OptimizerOptionsSchema.default(DEFAULT_OPTIMIZER_OPTIONS)
});

export const OptimizerResponseSchema = z.object({
  routeId: z.string().uuid(),
  visitOrder: z.array(z.string().min(1)),
  orderedStops: z.array(OrderedStopSchema).min(1),
  totalDistanceM: nonNegativeNumber,
  totalDurationS: nonNegativeNumber,
  diagnostics: DiagnosticsSchema
});

export const OptimizerWireOptionsSchema = z.object({
  strategy: z.enum(['fast', 'quality']).default('quality'),
  max_iterations: z.number().int().min(10).max(10_000).default(4_000),
  max_runtime_seconds: z.number().int().min(1).max(60).default(30),
  fallback_tolerance: z.number().min(0).max(1).default(0.15)
});

export const OptimizerWireRequestSchema = z.object({
  origin: CoordinatesSchema,
  destinations: z.array(DestinationStopSchema).min(1).max(30),
  distance_matrix: DistanceMatrixSchema.optional(),
  options: OptimizerWireOptionsSchema.optional()
});

export const OptimizerWireDiagnosticsSchema = z.object({
  strategy: z.enum(['fast', 'quality']),
  solver: z.string().min(1),
  iterations: z.number().int().nonnegative(),
  gap: z.number().min(0).max(1),
  fallback_used: z.boolean(),
  execution_ms: nonNegativeNumber
});

export const OptimizerWireResponseSchema = z.object({
  route_id: z.string().uuid(),
  visit_order: z.array(z.string().min(1)),
  ordered_stops: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().optional(),
      lat: latSchema,
      lng: lngSchema,
      sequence: z.number().int().nonnegative(),
      distance_from_previous_m: nonNegativeNumber,
      duration_from_previous_s: nonNegativeNumber,
      cumulative_distance_m: nonNegativeNumber,
      cumulative_duration_s: nonNegativeNumber
    })
  ).min(1),
  total_distance_m: nonNegativeNumber,
  total_duration_s: nonNegativeNumber,
  diagnostics: OptimizerWireDiagnosticsSchema
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type DestinationStop = z.infer<typeof DestinationStopSchema>;
export type DistanceMatrix = z.infer<typeof DistanceMatrixSchema>;
export type OptimizerOptions = z.infer<typeof OptimizerOptionsSchema>;
export type OrderedStop = z.infer<typeof OrderedStopSchema>;
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;
export type OptimizerRequest = z.infer<typeof OptimizerRequestSchema>;
export type OptimizerResponse = z.infer<typeof OptimizerResponseSchema>;
export type OptimizerWireOptions = z.infer<typeof OptimizerWireOptionsSchema>;
export type OptimizerWireRequest = z.infer<typeof OptimizerWireRequestSchema>;
export type OptimizerWireDiagnostics = z.infer<typeof OptimizerWireDiagnosticsSchema>;
export type OptimizerWireResponse = z.infer<typeof OptimizerWireResponseSchema>;
