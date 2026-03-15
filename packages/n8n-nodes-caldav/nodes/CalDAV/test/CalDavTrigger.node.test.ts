import {
  TEST_CREDENTIALS,
  generateTestUid,
  createTestCalendar,
  createEvent,
  updateEvent,
  deleteEvent,
  uniqueCalendar,
} from "./helpers";
import { CalDavTrigger } from "../CalDavTrigger.node";

import type { IDataObject, IPollFunctions, INode } from "n8n-workflow";

// Mock IPollFunctions with workflow static data persistence
function createMockPollFunctions(
  parameters: { [key: string]: unknown } = {},
  staticData: IDataObject = {},
): IPollFunctions {
  return {
    getNodeParameter: (
      parameterName: string,
      fallbackValue?: unknown,
      options?: { extractValue?: boolean },
    ) => {
      if (parameterName in parameters) {
        const value = parameters[parameterName];
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
      return fallbackValue;
    },
    getNode: () =>
      ({
        name: "CalDAV Trigger Test",
        typeVersion: 1,
        type: "n8n-nodes-caldav.calDavTrigger",
        id: "test-trigger-id",
        position: [0, 0],
      }) as INode,
    getCredentials: async (type: string) => {
      if (type === "calDavApi") {
        return TEST_CREDENTIALS.calDavApi as IDataObject;
      }
      throw new Error(`Unknown credential type: ${type}`);
    },
    getWorkflowStaticData: () => staticData,
    getMode: () => "trigger" as const,
    helpers: {
      returnJsonArray: (items: IDataObject | IDataObject[]) => {
        const itemsArray = Array.isArray(items) ? items : [items];
        return itemsArray.map((item) => ({ json: item }));
      },
    } as IPollFunctions["helpers"],
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as IPollFunctions["logger"],
  } as unknown as IPollFunctions;
}

describe("CalDavTrigger Integration Tests", () => {
  const triggerNode = new CalDavTrigger();

  describe("Event Created Trigger", () => {
    it("should trigger on first poll with existing events", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("created-first"),
      );

      const uid = generateTestUid("initial-event");
      const staticData: IDataObject = {};

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Initial Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventCreated",
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);

      if (!result) throw new Error("Result is null");
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.summary).toBe("Initial Event");

      expect(staticData.knownEvents).toBeDefined();
      expect((staticData.knownEvents as IDataObject)[uid]).toBeDefined();
    });

    it("should trigger on new events but not on existing events", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("created-new"),
      );

      const uid1 = generateTestUid("existing-event");
      const uid2 = generateTestUid("new-event");
      const staticData: IDataObject = {};

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid1,
        "Existing Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventCreated",
        },
        staticData,
      );

      const result1 = await triggerNode.poll.call(mockFunctions);
      expect(result1).toBeDefined();
      if (!result1) throw new Error("Result is null");
      expect(result1[0]).toHaveLength(1);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid2,
        "New Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const result2 = await triggerNode.poll.call(mockFunctions);
      expect(result2).toBeDefined();
      if (!result2) throw new Error("Result is null");
      expect(result2[0]).toHaveLength(1);
      expect(result2[0][0].json.summary).toBe("New Event");
      expect(result2[0][0].json.uid).toBe(uid2);
    });

    it("should not trigger when no new events exist", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("created-none"),
      );

      const uid = generateTestUid("no-change-event");
      const staticData: IDataObject = {};

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Static Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventCreated",
        },
        staticData,
      );

      await triggerNode.poll.call(mockFunctions);

      const result2 = await triggerNode.poll.call(mockFunctions);
      expect(result2).toBeNull();
    });
  });

  describe("Event Updated Trigger", () => {
    it("should trigger when event is updated", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("updated-detect"),
      );

      const uid = generateTestUid("update-event");
      const staticData: IDataObject = {};

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Original Summary",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventUpdated",
        },
        staticData,
      );

      const result1 = await triggerNode.poll.call(mockFunctions);
      expect(result1).toBeNull();

      await updateEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Updated Summary",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const result2 = await triggerNode.poll.call(mockFunctions);
      expect(result2).toBeDefined();
      if (!result2) throw new Error("Result is null");
      expect(result2[0]).toHaveLength(1);
      expect(result2[0][0].json.summary).toBe("Updated Summary");
    });

    it("should not trigger on new events", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("updated-skip-new"),
      );

      const uid = generateTestUid("new-no-trigger");
      const staticData: IDataObject = {};

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventUpdated",
        },
        staticData,
      );

      await triggerNode.poll.call(mockFunctions);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Brand New Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeNull();
    });
  });

  describe("Event Started Trigger", () => {
    // These tests avoid wall-clock sleeps by creating events whose start
    // time is already in the past and setting lastTimeChecked to before
    // that start time.  The trigger logic only checks whether the event's
    // start falls within [lastTimeChecked, now], so this is deterministic.

    it("should trigger when event start falls within the poll window", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("started-basic"),
      );

      const uid = generateTestUid("started-event");

      // Event started 30 seconds ago, ends in 1 hour.
      const startTime = new Date(Date.now() - 30_000);
      const endTime = new Date(Date.now() + 3600_000);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Already Started",
        startTime,
        endTime,
      );

      // Pretend the last poll was 60 seconds ago — the event start at -30s
      // falls inside [lastTimeChecked, now].
      const staticData: IDataObject = {
        lastTimeChecked: new Date(Date.now() - 60_000).toISOString(),
      };

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventStarted",
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeDefined();
      if (!result) throw new Error("Result is null");
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.summary).toBe("Already Started");
    });

    it("should not trigger when event start is outside the poll window", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("started-outside"),
      );

      const uid = generateTestUid("future-event");

      // Event starts in 1 hour — well outside the poll window.
      const startTime = new Date(Date.now() + 3600_000);
      const endTime = new Date(Date.now() + 7200_000);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Future Event",
        startTime,
        endTime,
      );

      const staticData: IDataObject = {
        lastTimeChecked: new Date(Date.now() - 60_000).toISOString(),
      };

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventStarted",
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeNull();
    });

    it("should expand recurring events into individual instances", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("started-recurring"),
      );

      const uid = generateTestUid("recurring-event");

      // Recurring event: first occurrence started 30 seconds ago.
      const startTime = new Date(Date.now() - 30_000);
      const endTime = new Date(startTime.getTime() + 3600_000);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Daily Standup",
        startTime,
        endTime,
        "FREQ=DAILY;COUNT=3",
      );

      const staticData: IDataObject = {
        lastTimeChecked: new Date(Date.now() - 60_000).toISOString(),
      };

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventStarted",
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeDefined();
      if (!result) throw new Error("Result is null");

      // Only the first occurrence should have started within the window;
      // the next occurrence is tomorrow.
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.summary).toBe("Daily Standup");

      // Expanded instances should not carry the RRULE.
      expect(result[0][0].json.rrule).toBeUndefined();
    });

    it("should trigger for event in the future when minutesBefore is set", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("started-offset"),
      );

      const uid = generateTestUid("offset-event");

      // Event starts in 9.5 minutes.  With minutesBefore=10 the trigger
      // time is 30 seconds ago, which falls inside [lastTimeChecked, now].
      const startTime = new Date(Date.now() + 9.5 * 60_000);
      const endTime = new Date(Date.now() + 11 * 60_000);

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Event in 10 Minutes",
        startTime,
        endTime,
      );

      const staticData: IDataObject = {
        lastTimeChecked: new Date(Date.now() - 60_000).toISOString(),
      };

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventStarted",
          minutesBefore: 10,
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeDefined();
      if (!result) throw new Error("Result is null");
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.summary).toBe("Event in 10 Minutes");
    });
  });

  describe("Cancelled Events", () => {
    it("should skip cancelled events but keep confirmed and tentative", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("cancelled-mix"),
      );

      const staticData: IDataObject = {};

      for (const [status, summary] of [
        ["CONFIRMED", "Confirmed Meeting"],
        ["TENTATIVE", "Tentative Meeting"],
        ["CANCELLED", "Cancelled Meeting"],
      ] as const) {
        await createEvent(
          testCalendarUrl,
          TEST_CREDENTIALS.calDavApi.username,
          TEST_CREDENTIALS.calDavApi.password,
          TEST_CREDENTIALS.calDavApi.serverUrl,
          generateTestUid(status.toLowerCase()),
          summary,
          new Date(Date.now() + 3600_000),
          new Date(Date.now() + 7200_000),
          undefined,
          status,
        );
      }

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventCreated",
        },
        staticData,
      );

      const result = await triggerNode.poll.call(mockFunctions);
      expect(result).toBeDefined();
      if (!result) throw new Error("Result is null");
      expect(result[0]).toHaveLength(2);

      const summaries = result[0].map((r) => r.json.summary).sort();
      expect(summaries).toEqual(["Confirmed Meeting", "Tentative Meeting"]);
    });
  });

  describe("ETag Cleanup", () => {
    it("should clean up ETags for deleted events", async () => {
      const testCalendarUrl = await createTestCalendar(
        uniqueCalendar("etag-cleanup"),
      );

      const uid = generateTestUid("cleanup-event");
      const staticData: IDataObject = {};

      await createEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
        "Temporary Event",
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      );

      const mockFunctions = createMockPollFunctions(
        {
          calendar: {
            __rl: true,
            mode: "url",
            value: testCalendarUrl,
          },
          triggerOn: "eventCreated",
        },
        staticData,
      );

      await triggerNode.poll.call(mockFunctions);
      expect((staticData.knownEvents as IDataObject)[uid]).toBeDefined();

      await deleteEvent(
        testCalendarUrl,
        TEST_CREDENTIALS.calDavApi.username,
        TEST_CREDENTIALS.calDavApi.password,
        TEST_CREDENTIALS.calDavApi.serverUrl,
        uid,
      );

      await triggerNode.poll.call(mockFunctions);
      expect((staticData.knownEvents as IDataObject)[uid]).toBeUndefined();
    });
  });
});
