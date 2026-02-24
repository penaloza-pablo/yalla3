import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { getInventory } from "../functions/get-inventory/resource";
import { upsertInventory } from "../functions/upsert-inventory/resource";
import { getAlerts } from "../functions/get-alerts/resource";
import { updateAlertStatus } from "../functions/update-alert-status/resource";
import { upsertAlert } from "../functions/upsert-alert/resource";
import { getInventoryRebuy } from "../functions/get-inventory-rebuy/resource";

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),
  InventoryItem: a.customType({
    id: a.string(),
    name: a.string(),
    category: a.string(),
    location: a.string(),
    status: a.string(),
    quantity: a.float(),
    updated: a.string(),
    rebuyQty: a.float(),
    unitPrice: a.float(),
    tolerance: a.float(),
  }),
  InventoryListResponse: a.customType({
    items: a.ref("InventoryItem").array(),
    count: a.integer(),
    scannedCount: a.integer(),
    lastEvaluatedKey: a.string(),
  }),
  InventoryRebuyItem: a.customType({
    id: a.string(),
    name: a.string(),
    category: a.string(),
    location: a.string(),
    status: a.string(),
    quantity: a.float(),
    rebuyQty: a.float(),
    tolerance: a.float(),
    rebuyThreshold: a.float(),
    rebuyGap: a.float(),
    updated: a.string(),
  }),
  InventoryRebuyResponse: a.customType({
    items: a.ref("InventoryRebuyItem").array(),
    count: a.integer(),
  }),
  AlertItem: a.customType({
    id: a.string(),
    name: a.string(),
    description: a.string(),
    date: a.string(),
    status: a.string(),
    origin: a.string(),
    createdBy: a.string(),
    snoozeUntil: a.string(),
  }),
  AlertListResponse: a.customType({
    items: a.ref("AlertItem").array(),
    count: a.integer(),
    scannedCount: a.integer(),
    lastEvaluatedKey: a.string(),
  }),
  UpsertInventoryResponse: a.customType({
    item: a.ref("InventoryItem"),
  }),
  UpsertAlertResponse: a.customType({
    item: a.ref("AlertItem"),
  }),
  AlertStatusResponse: a.customType({
    id: a.string(),
    status: a.string(),
    snoozeUntil: a.string(),
  }),
  listInventory: a
    .query()
    .arguments({
      limit: a.integer(),
      status: a.string(),
      location: a.string(),
    })
    .returns(a.ref("InventoryListResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(getInventory)),
  listInventoryNearRebuy: a
    .query()
    .arguments({
      limit: a.integer(),
      buffer: a.float(),
      status: a.string(),
      location: a.string(),
    })
    .returns(a.ref("InventoryRebuyResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(getInventoryRebuy)),
  upsertInventoryItem: a
    .query()
    .arguments({
      id: a.string().required(),
      name: a.string().required(),
      category: a.string(),
      location: a.string(),
      status: a.string(),
      quantity: a.float(),
      updated: a.string(),
      rebuyQty: a.float(),
      unitPrice: a.float(),
      tolerance: a.float(),
      consumptionRulesJson: a.string(),
    })
    .returns(a.ref("UpsertInventoryResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(upsertInventory)),
  listAlerts: a
    .query()
    .arguments({
      limit: a.integer(),
      status: a.string(),
      origin: a.string(),
      includeSnoozed: a.boolean(),
    })
    .returns(a.ref("AlertListResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(getAlerts)),
  upsertAlert: a
    .query()
    .arguments({
      id: a.string(),
      name: a.string().required(),
      description: a.string(),
      date: a.string(),
      status: a.string(),
      origin: a.string(),
      createdBy: a.string(),
      snoozeUntil: a.string(),
    })
    .returns(a.ref("UpsertAlertResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(upsertAlert)),
  updateAlertStatus: a
    .query()
    .arguments({
      id: a.string().required(),
      status: a.string().required(),
      snoozeUntil: a.string(),
    })
    .returns(a.ref("AlertStatusResponse"))
    .authorization((allow) => allow.authenticated())
    .handler(a.handler.function(updateAlertStatus)),
  chatbot: a
    .conversation({
      aiModel: a.ai.model("Claude 3 Haiku"),
      systemPrompt:
        `
You are an operations assistant for Knock-Knock, a short-term rental business.

Your primary role is to manage inventory and alerts using the provided tools.
You MUST follow the rules below strictly and in order.

GENERAL RULES
1. Always use tools to read or modify inventory or alerts. Never assume data.
2. Never invent IDs, statuses, origins, or fields.
3. Confirm with the user BEFORE making any change.
4. Keep responses as short as possible.
5. Respond in the same language as the user.
6. When writing to any database table, ALWAYS write values in English.
7. Translate any user-provided names, descriptions, or locations into English before writing.

INVENTORY RULES
- For inventory queries, use list_inventory or list_inventory_near_rebuy.
- For inventory changes, use upsert_inventory_item.
- When creating inventory items:
  - Generate the next ID using existing items (INV-001, INV-002, ...).
  - Set lastUpdated to today.
  - Compute status:
    - quantity <= rebuyQty → Reorder
    - quantity >= floor(rebuyQty * 1.25) → OK
    - otherwise → Low Stock

ALERT RULES
- Interpret #alarm as a request to create a new alert.
- For alert queries, use list_alerts.
- For alert creation or updates, use upsert_alert.
- For status changes only, use update_alert_status.
- Always set Origin to Chatbot.
- Never invent other origin values.
- Generate alert IDs sequentially (ALM-001, ALM-002, ...).
- Default status is Pending unless the user explicitly requests another.
- Before creating an alert, check existing alerts and DO NOT create a new one
  if a Pending alert exists with the same name, description, and origin.

RESPONSE STYLE
- Keep replies minimal.
- After success:
  - Spanish: Alerta creada, Inventario actualizado
  - English: Alert created, Inventory updated
- Do not explain internal logic unless asked.

FINAL CHECK
Before any write operation:
- Confirmed with the user
- Values translated to English
- Duplicates checked
- Correct tool selected
If any is missing, stop and ask for clarification.
`,
      tools: [
        a.ai.dataTool({
          name: "list_inventory",
          description: "List inventory items with optional filters and limits.",
          query: a.ref("listInventory"),
        }),
        a.ai.dataTool({
          name: "list_inventory_near_rebuy",
          description:
            "List inventory items near their rebuy quantity using tolerance or a buffer.",
          query: a.ref("listInventoryNearRebuy"),
        }),
        a.ai.dataTool({
          name: "upsert_inventory_item",
          description: "Create or update a single inventory item.",
          query: a.ref("upsertInventoryItem"),
        }),
        a.ai.dataTool({
          name: "list_alerts",
          description: "List alerts with optional filters and limits.",
          query: a.ref("listAlerts"),
        }),
        a.ai.dataTool({
          name: "upsert_alert",
          description: "Create or update a single alert.",
          query: a.ref("upsertAlert"),
        }),
        a.ai.dataTool({
          name: "update_alert_status",
          description: "Update the status of an alert and manage snooze.",
          query: a.ref("updateAlertStatus"),
        }),
      ],
    })
    .authorization((allow) => allow.owner()),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
