import { createRequire } from "module";
import importAsString from "@reactioncommerce/api-utils/importAsString.js";

import Mutation from "./resolver/Mutation.js";
import Query from "./resolver/Query.js";
import UnitOwnership from "./resolver/UnitOwnership.js";
import trade from "./resolver/trade.js";
import Subscription from "./resolver/Subscription.js";
import mutations from "./mutations/index.js";

const schemas = importAsString("./schema/schema.graphql");
const require = createRequire(import.meta.url);
const pkg = require("../package.json");

console.log("Schema here", schemas);
/**
 * @summary Import and call this function to add this plugin to your API.
 * @param {Object} app The ReactionAPI instance
 * @returns {undefined}
 */

const resolvers = {
  UnitOwnership,
  Mutation,
  Query,
  trade,
  Subscription,
};
export default async function register(app) {
  await app.registerPlugin({
    label: pkg.label,
    name: "trade",
    version: pkg.version,
    collections: {
      Trades: {
        name: "Trades",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      Ownership: {
        name: "Ownership",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      Votes: {
        name: "Votes",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
    },
    graphQL: {
      schemas: [schemas],
      resolvers,
    },
    mutations,
  });
}
