import { createRequire } from "module";
import importAsString from "@reactioncommerce/api-utils/importAsString.js";
import resolvers from "./resolver/resolver.js";
const schemas = importAsString("./schema/schema.graphql");
const require = createRequire(import.meta.url);
const pkg = require("../package.json");

console.log("Schema here", schemas);
/**
 * @summary Import and call this function to add this plugin to your API.
 * @param {Object} app The ReactionAPI instance
 * @returns {undefined}
 */
export default async function register(app) {
  await app.registerPlugin({
    label: pkg.label,
    name: pkg.name,
    version: pkg.version,
    collections: {
      Trades: {
        name: "Trades",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
    },
    graphQL: {
      schemas: [schemas],
      resolvers,
    },
  });
}
