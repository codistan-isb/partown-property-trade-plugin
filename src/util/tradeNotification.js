// To be used for buyer, seller, trustee/manager and admin to send notification for when a purchase is made against the trade

//1. checks whether the the account has subscribed to either sms or phone or both alerts
//2. sends either email, sms or both depending on alert preferences

import _ from "lodash";

import sendTradeEmail from "./sendTradeEmail.js";

export default async function tradeNotification(
  context,
  accountId,
  propertyTitle,
  units,
  fullName,
  propertyImage,
  slug
) {
  const propertyUrl = `https://dev.partown.co/en/product/${slug}`;
  const { Accounts } = context.collections;

  const account = await Accounts.findOne({ _id: accountId });

  //account information

  let email = _.get(account, "emails[0].address");

  console.log("email is***** ", email);

  let profileImage = _.get(account, "profile.picture");

  const hasEnabledEmailNotification = _.get(
    account,
    "userPreferences.contactPreferences.email"
  );
  const hasEnabledSMSNotification = _.get(
    account,
    "userPreferences.contactPreferences.sms"
  );

  console.log(
    "enabled check",
    hasEnabledEmailNotification,
    hasEnabledSMSNotification
  );

  if (hasEnabledEmailNotification) {
    await sendTradeEmail(
      context,
      propertyTitle,
      units,
      email,
      fullName,
      profileImage,
      propertyImage,
      propertyUrl
    );
  }
  if (hasEnabledSMSNotification) {
    console.log("*******sending phone notification**********");
  }
  return true;
}
