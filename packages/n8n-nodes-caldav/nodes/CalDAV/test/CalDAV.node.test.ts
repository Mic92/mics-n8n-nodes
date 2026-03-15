import {
  TEST_CREDENTIALS,
  generateTestUid,
  generateISODateTime,
  createTestCalendar,
  uniqueCalendar,
} from "./helpers";
import { CalDav } from "../CalDav.node";

import type {
  IDataObject,
  IExecuteFunctions,
  INode,
  INodeExecutionData,
} from "n8n-workflow";

// Fixtures for test data
async function createTestEvent(
  caldavNode: CalDav,
  calendarUrl: string,
  options: {
    summary?: string;
    uid?: string;
    allDay?: boolean;
    rrule?: string;
  } = {},
): Promise<string> {
  const uid = options.uid || generateTestUid("event");
  const startTime = generateISODateTime(1);
  const endTime = generateISODateTime(2);

  const params: { [key: string]: unknown } = {
    resource: "event",
    operation: "create",
    calendar: {
      __rl: true,
      mode: "url",
      value: calendarUrl,
    },
    summary: options.summary || "Test Event",
    start: startTime,
    end: endTime,
    additionalFields: { uid },
  };

  if (options.allDay) {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000)
      .toISOString()
      .split("T")[0];
    params.start = today;
    params.end = tomorrow;
    (params.additionalFields as { [key: string]: unknown }).allDay = true;
  }

  if (options.rrule) {
    (params.additionalFields as { [key: string]: unknown }).rrule =
      options.rrule;
  }

  const mockFunctions = createMockExecuteFunctions(params);
  const result = await caldavNode.execute.call(mockFunctions);
  return result[0][0].json.url as string;
}

async function createTestTodo(
  caldavNode: CalDav,
  calendarUrl: string,
  options: {
    summary?: string;
    uid?: string;
    priority?: number;
  } = {},
): Promise<string> {
  const uid = options.uid || generateTestUid("todo");

  const mockFunctions = createMockExecuteFunctions({
    resource: "todo",
    operation: "create",
    calendar: {
      __rl: true,
      mode: "url",
      value: calendarUrl,
    },
    summary: options.summary || "Test Todo",
    additionalFields: {
      uid,
      priority: options.priority || 5,
    },
  });

  const result = await caldavNode.execute.call(mockFunctions);
  return result[0][0].json.url as string;
}

// Mock the execute functions context
function createMockExecuteFunctions(
  parameters: { [key: string]: unknown } = {},
): IExecuteFunctions {
  const items: INodeExecutionData[] = [{ json: {} }];

  return {
    getNodeParameter: (
      parameterName: string,
      _index: number,
      fallbackValue?: unknown,
      options?: { extractValue?: boolean },
    ) => {
      if (parameterName in parameters) {
        const value = parameters[parameterName];
        // Handle resource locator extraction
        if (
          options?.extractValue &&
          value &&
          typeof value === "object" &&
          "value" in value
        ) {
          return (value as { value: unknown }).value;
        }
        return value;
      }
      // Return empty object for collection parameters like "options" if not provided
      if (parameterName === "options" && fallbackValue === undefined) {
        return {};
      }
      return fallbackValue;
    },
    getNode: () =>
      ({
        name: "CalDAV Test Node",
        typeVersion: 1,
        type: "n8n-nodes-caldav.calDav",
        id: "test-node-id",
        position: [0, 0],
      }) as INode,
    getCredentials: async (type: string) => {
      if (type === "calDavApi") {
        return TEST_CREDENTIALS.calDavApi as IDataObject;
      }
      throw new Error(`Unknown credential type: ${type}`);
    },
    getInputData: () => items,
    getWorkflowDataProxy: () =>
      ({}) as ReturnType<IExecuteFunctions["getWorkflowDataProxy"]>,
    helpers: {
      returnJsonArray: (items: IDataObject | IDataObject[]) => {
        const itemsArray = Array.isArray(items) ? items : [items];
        return itemsArray.map((item) => ({ json: item }));
      },
      constructExecutionMetaData: (
        inputData: INodeExecutionData[],
        _options: { itemData: { item: number } },
      ) => {
        return inputData;
      },
    } as IExecuteFunctions["helpers"],
    continueOnFail: () => false,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as IExecuteFunctions["logger"],
  } as unknown as IExecuteFunctions;
}

describe("CalDAV Integration Tests", () => {
  const caldavNode = new CalDav();

  describe("Calendar Operations", () => {
    it("should get all calendars", async () => {
      const mockFunctions = createMockExecuteFunctions({
        resource: "calendar",
        operation: "getAll",
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(Array.isArray(result[0])).toBe(true);
    });
  });

  describe("Event Operations", () => {
    it("should create a basic event", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-create"),
      );

      const uid = generateTestUid("event");
      const startTime = generateISODateTime(1);
      const endTime = generateISODateTime(2);

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "create",
        calendar: {
          __rl: true,
          mode: "url",
          value: testCalendarUrl,
        },
        summary: "Test Event",
        start: startTime,
        end: endTime,
        additionalFields: {
          uid,
          description: "This is a test event",
          location: "Test Location",
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const event = result[0][0].json;
      expect(event.summary).toBe("Test Event");
      expect(event.description).toBe("This is a test event");
      expect(event.location).toBe("Test Location");
      expect(event.url).toBeDefined();
    });

    it("should create an all-day event", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-allday"),
      );

      const uid = generateTestUid("allday-event");
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "create",
        calendar: {
          __rl: true,
          mode: "url",
          value: testCalendarUrl,
        },
        summary: "All-Day Event",
        start: today,
        end: tomorrow,
        additionalFields: {
          uid,
          allDay: true,
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const event = result[0][0].json;
      expect(event.summary).toBe("All-Day Event");
      expect(event.allDay).toBe(true);
    });

    it("should create a recurring event", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-recurring"),
      );

      const uid = generateTestUid("recurring-event");
      const startTime = generateISODateTime(1);
      const endTime = generateISODateTime(2);

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "create",
        calendar: {
          __rl: true,
          mode: "url",
          value: testCalendarUrl,
        },
        summary: "Weekly Meeting",
        start: startTime,
        end: endTime,
        additionalFields: {
          uid,
          rrule: "FREQ=WEEKLY;COUNT=10",
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const event = result[0][0].json;
      expect(event.summary).toBe("Weekly Meeting");
      expect(event.rrule).toBeDefined();
      expect(event.rrule).toContain("FREQ=WEEKLY");
    });

    it("should get all events from calendar", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-getall"),
      );

      await createTestEvent(caldavNode, testCalendarUrl, {
        summary: "Event 1",
      });
      await createTestEvent(caldavNode, testCalendarUrl, {
        summary: "Event 2",
      });

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "getAll",
        calendar: {
          __rl: true,
          mode: "url",
          value: testCalendarUrl,
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0].length).toBeGreaterThanOrEqual(2);
    });

    it("should update an event", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-update"),
      );

      const eventUrl = await createTestEvent(caldavNode, testCalendarUrl, {
        summary: "Event to Update",
      });

      const getResult = await caldavNode.execute.call(
        createMockExecuteFunctions({
          resource: "event",
          operation: "get",
          eventUrl,
        }),
      );
      const existingEvent = getResult[0][0].json;

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "update",
        eventUrl,
        etag: existingEvent.etag as string,
        summary: "Updated Test Event",
        start: existingEvent.start as string,
        end: existingEvent.end as string,
        additionalFields: {
          uid: existingEvent.uid as string,
          description: "This event has been updated",
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const event = result[0][0].json;
      expect(event.summary).toBe("Updated Test Event");
      expect(event.description).toBe("This event has been updated");
    });

    it("should delete an event", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("evt-delete"),
      );

      const eventUrl = await createTestEvent(caldavNode, testCalendarUrl, {
        summary: "Event to Delete",
      });

      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "delete",
        eventUrl,
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const response = result[0][0].json;
      expect(response.success).toBe(true);
    });
  });

  describe("Todo Operations", () => {
    it("should create a todo", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("todo-create"),
      );

      const uid = generateTestUid("todo");

      const mockFunctions = createMockExecuteFunctions({
        resource: "todo",
        operation: "create",
        calendar: {
          __rl: true,
          mode: "url",
          value: testCalendarUrl,
        },
        summary: "Test Todo",
        additionalFields: {
          uid,
          description: "This is a test todo",
          priority: 5,
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const todo = result[0][0].json;
      expect(todo.summary).toBe("Test Todo");
      expect(todo.description).toBe("This is a test todo");
      expect(todo.priority).toBe(5);
      expect(todo.url).toBeDefined();
    });

    it("should update a todo", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("todo-update"),
      );

      const todoUrl = await createTestTodo(caldavNode, testCalendarUrl, {
        summary: "Todo to Update",
      });

      const getResult = await caldavNode.execute.call(
        createMockExecuteFunctions({
          resource: "todo",
          operation: "get",
          todoUrl,
        }),
      );
      const existingTodo = getResult[0][0].json;

      const mockFunctions = createMockExecuteFunctions({
        resource: "todo",
        operation: "update",
        todoUrl,
        etag: existingTodo.etag as string,
        summary: "Updated Todo",
        additionalFields: {
          uid: existingTodo.uid as string,
          priority: 1,
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const todo = result[0][0].json;
      expect(todo.summary).toBe("Updated Todo");
      expect(todo.priority).toBe(1);
    });

    it("should complete a todo", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("todo-complete"),
      );

      const todoUrl = await createTestTodo(caldavNode, testCalendarUrl, {
        summary: "Todo to Complete",
      });

      const getResult = await caldavNode.execute.call(
        createMockExecuteFunctions({
          resource: "todo",
          operation: "get",
          todoUrl,
        }),
      );
      const existingTodo = getResult[0][0].json;

      const mockFunctions = createMockExecuteFunctions({
        resource: "todo",
        operation: "update",
        todoUrl,
        etag: existingTodo.etag as string,
        summary: existingTodo.summary as string,
        additionalFields: {
          uid: existingTodo.uid as string,
          completed: true,
          status: "COMPLETED",
        },
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const todo = result[0][0].json;
      expect(todo.completed).toBe(true);
      expect(todo.status).toBe("COMPLETED");
    });

    it("should delete a todo", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("todo-delete"),
      );

      const todoUrl = await createTestTodo(caldavNode, testCalendarUrl, {
        summary: "Todo to Delete",
      });

      const mockFunctions = createMockExecuteFunctions({
        resource: "todo",
        operation: "delete",
        todoUrl,
      });

      const result = await caldavNode.execute.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result[0]).toHaveLength(1);
      const response = result[0][0].json;
      expect(response.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid calendar URL", async () => {
      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "getAll",
        calendar: {
          __rl: true,
          mode: "url",
          value: "http://127.0.0.1:5232/nonexistent/calendar/",
        },
      });

      await expect(caldavNode.execute.call(mockFunctions)).rejects.toThrow();
    });

    it("should handle invalid event URL in update", async () => {
      const mockFunctions = createMockExecuteFunctions({
        resource: "event",
        operation: "update",
        eventUrl: "http://127.0.0.1:5232/test/calendar/nonexistent.ics",
        updateFields: {
          summary: "This should fail",
        },
      });

      await expect(caldavNode.execute.call(mockFunctions)).rejects.toThrow();
    });
  });
});
