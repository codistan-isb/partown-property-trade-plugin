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
  price,
  slug,
  description
) {
  const propertyUrl = `${process.env.CLIENT_URL}/product/${slug}`;
  const { Accounts } = context.collections;

  const account = await Accounts.findOne({ _id: accountId });

  //account information

  let email = _.get(account, "emails[0].address");
  let firstName = _.get(account, "profile.firstName");
  let lastName = _.get(account, "profile.lastName");

  let phoneNumber = _.get(account, "profile.phone");

  // validate whether the user has enabled notifications services for their account or not
  const hasEnabledEmailNotification = _.get(
    account,
    "userPreferences.contactPreferences.email"
  );
  const hasEnabledSMSNotification = _.get(
    account,
    "userPreferences.contactPreferences.sms"
  );

  if (hasEnabledEmailNotification) {
    await sendTradeEmail(
      context,
      propertyTitle,
      units,
      price,
      propertyUrl,
      description,
      firstName,
      lastName,
      email
    );
  }
  if (hasEnabledSMSNotification) {
    console.log("*******sending phone notification**********");
    await context.mutations.sendPhoneNotification(
      phoneNumber,
      "Trade Altert",
      `A trade has been completed. Click here to View property ${propertyUrl}`
    );
  }
  return true;
}
