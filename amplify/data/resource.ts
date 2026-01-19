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
      id: a.string().required(),
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
        "You are a production operations assistant for vacation rentals. Always use tools to read or modify inventory and alerts. For inventory questions, use list_inventory or list_inventory_near_rebuy. For alert questions, use list_alerts. For data changes, use upsert_inventory_item, upsert_alert, or update_alert_status. When creating inventory items, generate the next ID using existing items (INV-001, INV-002, ...), set last updated to today, and compute status: if quantity <= rebuyQty then Reorder, if quantity >= floor(rebuyQty * 1.25) then OK, otherwise Low Stock. Confirm before making any change. Summarize results in clear, concise English.",
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
