import ObjectID from "mongodb";
export default async function checkTradeExpiry(collections, tradeId) {
  const { Trades } = collections;
  const currentDate = new Date();

  let { expirationTime } = await Trades.findOne({
    _id: ObjectID.ObjectId(tradeId),
  });

  const expirationDate = new Date(expirationTime);

  if (currentDate > expirationDate) {
    throw new Error("This offer has expired");
  }
}
