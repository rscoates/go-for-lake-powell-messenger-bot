'use strict';
const baseDir = "/home/ec2-user";
const logger = require(`${baseDir}/my-logger`);
const TripFinder = require('flight-details-parser/app/trip-finder');
const WebhookPostHandler = require(`${baseDir}/webhook-post-handler`);

function HotelReceiptManager(options, testing) {
  this.testing = testing;
  if(!options) throw new Error(`expected parameter options is missing`);
  validate.call(this, options);
  this.details = {};
  this.receipt = {
    template_type: "receipt",
    recipient_name: options.recipient_name,
    order_number: options.order_number,
    merchant_name: options.merchant_name,
    payment_method: options.payment_method,
    currency: options.currency,
    order_url: options.order_url,
    // timestamp: options.timestamp,
    elements: [{
      title: `Confirmation #:${options.order_number}`,
      subtitle: options.room_type,
      price: options.total_price,
      currency: options.currency,
    }],
    address: {
      street_1: options.street_1,
      city: options.city,
      state: options.state,
      country: options.country,
      postal_code: options.postal_code
    },
    summary: {
      total_cost: options.total_price
    }
  };
  this.receipt_ext = {
    template_type: 'generic',
    elements: [{
      title: `Phone: ${options.phone}`,
      buttons: [{
        type: "web_url",
        url: options.order_url,
        title: "Hotel rental"
      }],
      subtitle: `CHECK-IN: ${options.check_in_date}; CHECK-OUT: ${options.check_out_date}`
    }]
  };
  this.check_in_date = options.check_in_date;
  if(options.image_url) this.receipt.elements[0].image_url = options.image_url;
  if(options.street_2) this.receipt.address.street_2 = options.street_2;
  if(options.subtotal) this.receipt.summary.subtotal = options.subtotal;
  if(options.total_tax) this.receipt.summary.total_tax = options.total_tax;
}

function validate(options) {
  const requiredFields = ['recipient_name', 'order_number', 'merchant_name', 'payment_method', 'currency', 'order_url', 'check_in_date', 'check_out_date', 'phone', 'car_type', 'total_price', 'street_1', 'city', 'state', 'country', 'postal_code'];
  requiredFields.forEach(field => {
    if(!options[field]) throw new Error(`Required field ${field} missing in options`);
  });
}

HotelReceiptManager.prototype.handle = function() {
  const tripFinder = new TripFinder(this.receipt.recipient_name);
  this.trip = tripFinder.getTripForReceipt(this.check_in_date, this.receipt.address.city);
  this.postHandler = new WebhookPostHandler(tripFinder.getSession(), this.testing);
  const file = this.trip.rentalCarReceiptFile();
  try {
    this.details.receipt = this.receipt;
    this.details.receipt_ext = this.receipt_ext;
    const json = JSON.stringify(this.details);
    require('fs').writeFileSync(file, json, 'utf8');
    // send a notification to the user that we have their details and will send them the boarding pass the day before the flight.
    logger.debug(`handle: wrote ${json.length} bytes to file ${file}`);
    // notify user that we have received a boarding pass.
    const message = `Received rental car receipt for your trip to ${this.trip.getPortOfEntry()}. Type 'get car details' to see details`;
    logger.debug(`handle: About to send message to user: ${message}`);
    this.postHandler.notifyUser(message);
  }
  catch(e) {
    logger.error(`parse: Error writing to file ${file}. ${e.stack}`);
    throw e;
  }
  logger.debug(`handle: Stored rental car details and pushed notification`);
  return true;
}

HotelReceiptManager.prototype.handle1 = function() {
  const receipt = {
        "template_type":"receipt",
        "recipient_name":"Madhu Parthasarathy",
        "merchant_name": "Hotel Rey Don Felipe",
        "order_number":"153053486434",
        "payment_method": "credit card",
        "currency":"USD",
        "order_url":"http://click.expediamail.com/?qs=105f88ab54fd8686d9295fab692d1410ad4e7b90fd6c16a7e1a0f582df8cb08e22dfacddf07393c2041daca53a17ee6b",
        "timestamp":"1428444852", 
        "elements":[
          {
            "title":"Confirmation #: 153053486434",
            "subtitle":"Standard Double or Twin Room - Breakfast plan, non-smoking for 2 adults",
            "price":132.26,
            "currency":"USD"
          },
        ],
        "address":{
          "street_1":"Armando Sanhueza 965",
          "city":"Punta Arenas",
          "state":"Magallanes",
          "postal_code":"6200729",
          "country":"Chile"
        },
        "summary":{
          "subtotal":132.26,
          "total_tax":0,
          "total_cost":132.26
        },
        "adjustments":[{
            "name":"Daily rate",
            "amount":132.26
        }]
  };
	require('fs').writeFileSync("/tmp/hotel-receipt.txt", JSON.stringify(receipt), 'utf8');
}

module.exports = HotelReceiptManager;
