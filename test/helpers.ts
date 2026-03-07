import type {
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
} from "n8n-workflow";

/**
 * Create a minimal mock of IExecuteFunctions for node-level tests.
 *
 * @param params   - Map of node parameter name → value (returned by getNodeParameter)
 * @param credentials - Optional map of credential type → credential data
 * @param opts     - Additional overrides (continueOnFail, input items)
 */
export function createMockExecuteFunctions(
  params: Record<string, unknown>,
  credentials?: Record<string, IDataObject>,
  opts?: {
    continueOnFail?: boolean;
    inputItems?: INodeExecutionData[];
  },
): IExecuteFunctions {
  return {
    getInputData: () =>
      opts?.inputItems ?? ([{ json: {} }] as INodeExecutionData[]),
    getNodeParameter: (name: string) => params[name],
    getCredentials: async (type: string) => credentials?.[type] ?? {},
    getNode: () => ({ name: "TestNode", typeVersion: 1, type: "test" }),
    continueOnFail: () => opts?.continueOnFail ?? false,
    helpers: {
      returnJsonArray: (data: IDataObject | IDataObject[]) =>
        (Array.isArray(data) ? data : [data]).map((d) => ({ json: d })),
      constructExecutionMetaData: (
        inputData: INodeExecutionData[],
        _opts: object,
      ) => inputData,
    },
  } as unknown as IExecuteFunctions;
}
