import generateUID from "../util/generateUID.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import Twilio from "twilio";

var accountSid = process.env.TWILIO_ACCOUNT_SID;
var authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new Twilio(accountSid, authToken);

/**
 * @method createNotification
 * @summary Get all of a Unit's Variants or only a Unit's top level Variants.
 * @param {Object} context - an object containing the per-request state
 * @param {String} unitOrVariantId - A Unit or top level Unit Variant ID.
 * @param {Boolean} topOnly - True to return only a unit's top-level variants.
 * @param {Object} args - an object of all arguments that were sent by the client
 * @param {Boolean} args.shouldIncludeHidden - Include hidden units in results
 * @param {Boolean} args.shouldIncludeArchived - Include archived units in results
 * @returns {Promise<Object[]>} Array of Unit Variant objects.
 */
export default async function sendPhoneNotification(phoneNumber, body) {
  try {
    console.log("send phone notification", phoneNumber, body);

    const data = await client.messages.create({
      body: body,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NO,
    });

    console.log(data);
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
}
