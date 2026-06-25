export interface GscFilter {
  dimension: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains';
  expression: string;
}

export interface GscQueryOptions {
  type?: string;
  filters?: GscFilter[];
  startRow?: number;
}

export function buildSearchAnalyticsBody(
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
  options: GscQueryOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { startDate, endDate, dimensions, rowLimit };
  if (options.type) body.type = options.type;
  if (options.startRow) body.startRow = options.startRow;
  if (options.filters && options.filters.length > 0) {
    body.dimensionFilterGroups = [
      {
        groupType: 'and',
        filters: options.filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator,
          expression: f.expression,
        })),
      },
    ];
  }
  return body;
}
