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
export default async function closeTrade(collections, tradeId) {
  const { Trades } = collections;
  const date = new Date();
  const { area } = await Trades.findOne({
    _id: ObjectID.ObjectId(tradeId),
  });
  if (area === 0) {
    await Trades.updateOne(
      {
        _id: ObjectID.ObjectId(tradeId),
      },
      { $set: { completionStatus: "completed", updatedAt: date } }
    );
  }
}
