import ObjectID from "mongodb";
/**
 *
 * @method placeBidOnProduct
 * @summary Get all of a Unit's Variants or only a Unit's top level Variants.
 * @param {Object} context - an object containing the per-request state
 * @param {String} unitOrVariantId - A Unit or top level Unit Variant ID.
 * @param {Boolean} topOnly - True to return only a units top level variants.
 * @param {Object} args - an object of all arguments that were sent by the client
 * @param {Boolean} args.shouldIncludeHidden - Include hidden units in results
 * @param {Boolean} args.shouldIncludeArchived - Include archived units in results
 * @returns {Promise<Object[]>} Array of Unit Variant objects.
 */
export default async function validateMinQty(collections, tradeId, quantity) {
  const { Trades } = collections;
  console.log("objectID is ");

  console.log(ObjectID.ObjectId(tradeId));
  const result = await Trades.findOne({
    _id: ObjectID.ObjectId(tradeId),
  });

  console.log("result is ", result);
  if (!result) return new Error("Trade Does Not Exist");
  const { minQty } = result;
  console.log("min qty is ", minQty);
  console.log("quantity is ", quantity);
  if (quantity < minQty) {
    console.log("reaching condition");

    throw new Error("Quantity cannot be less than minimum quantity");
  }
}
