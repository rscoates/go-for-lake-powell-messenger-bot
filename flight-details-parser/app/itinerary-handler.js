'use strict';

const fs = require('fs');
const ItineraryFlightInfo = require('flight-details-parser/app/itinerary-flight-info');
const TripFinder = require('flight-details-parser/app/trip-finder');

const baseDir = "/home/ec2-user";
const logger = require(`${baseDir}/my-logger`);


function ItineraryHandler(options, testing) {
	// set the flightNum_seats option
  // number of seats should be numPassengers x numFlights
  logger.debug(`ItineraryHandler: travel_class: ${options.travel_class}; travel_class length: ${options.travel_class.length}; options.flight_num: ${options.flight_num.length}; options.names: ${options.names.length}`);
  let defaultTc;
  options = setTravelClass(options);
  // if(options.travel_class.length === 1) defaultTc = options.travel_class[0];
	if(options.seats && Array.isArray(options.seats)) {
    let seatIdx = 0;
    // for each flight, for each passenger, identify the seat number, travel class and push it.
    for(let f = 0; f < options.flight_num.length; f++) {
      const fNum = options.flight_num[f];
      if(!options[fNum]) {
        options[fNum] = {};
      }
      for(let n = 0; n < options.names.length; n++) {
        const num = options.flight_num[f];
				const key = `${num}_seats`;
				if(!options[key]) options[key] = [];
        const tc = options.passenger_travelClass[seatIdx];
        /*
        const tc = (defaultTc) ? defaultTc : options.travel_class[seatIdx];
        logger.debug(`setting travel_class to ${tc}`);
        if(tc != 'economy' && tc != 'business' && tc != 'first_class') throw new Error(`travel class needs to be one of economy, business, first_class. But it is ${tc}. flight_num is ${options.flight_num[f]}`);
        */
				options[key].push({
          'seat': options.seats[seatIdx++],
          'travel_class': tc
        });
      }
    }
	}
	delete options.seats;
  // uses the format expected by facebook. Details of the data structure are at: https://developers.facebook.com/docs/messenger-platform/send-api-reference/airline-boardingpass-template
	if(!options.currency) options.currency = "USD";
  this.details = {
    template_type: 'airline_itinerary',
    'intro_message': `Flight itinerary for your trip`,
    'locale': "en_US",
    pnr_number: options.pnr,
    passenger_info: getPassengerInfo.call(this, options),
    flight_info: new ItineraryFlightInfo(options).get(),
    total_price: options.total_price,
    currency: options.currency
  };
	const dd = new Date(this.details.flight_info[0].flight_schedule.departure_time);
	this.departure_date = `${dd.getFullYear()}-${dd.getMonth()+1}-${dd.getDate()}`;
  // logger.debug(`itinerary details so far: ${JSON.stringify(this.details)}`);
  this.details.passenger_segment_info = getPassengerSegmentInfo.call(this, options);
  if(options.seat) this.details.seat = options.seat;
  this.testing = testing;
  validate.call(this);
}

/*
  travel_class is present in two places:
  1) In FlightInfo object
  2) In PassengerSegmentInfo (as seat_type)

  So, options.travel_class array can contain:
  1) Just one element. In this case, all the flights for all passengers use this in both FlightInfo and PassengerSegmentInfo objects. Update options.travel_class
  2) Same number of elements as flight. In this case, for each flight, all passengers have the same travel_class. 
  3) Same number of elements as flight X passengers. 

  This function updates options.flightInfo_travelClass and options.passenger_travelClass as arrays, used to udpate the FlightInfo & PassengerSegmentInfo objects. 
*/
function setTravelClass(options) {
  if(!options) throw new Error(`setTravelClass: required parameter 'options' is not defined`);
  if(!options.travel_class) throw new Error(`setTravelClass: required parameter options.travel_class is not defined`);
  const tcLength = options.travel_class.length;
  for(let i = 0; i < tcLength; i++) {
    const tc = options.travel_class[i];
    if(tc != 'economy' && tc != 'business' && tc != 'first_class') throw new Error(`travel class needs to be one of economy, business, first_class. But it is ${tc}. Options dump: ${JSON.stringify(options)}`);
  }
  const flightCount = options.flight_num.length;
  const passengerCount = options.names.length;
  if(tcLength != 1 && tcLength != flightCount && (tcLength != (flightCount * passengerCount))) throw new Error(`setTravelClass: options.travel_class (${options.travel_class}) does not contain the right number of elements. Entire dump: ${JSON.stringify(options)}`);

  options.flightInfo_travelClass = []; 
  options.passenger_travelClass = [];
  if(tcLength === 1) {
    const tc = options.travel_class[0];
    for(let i = 0; i < flightCount; i++) {
      options.flightInfo_travelClass.push(tc);
      for(let i = 0; i < passengerCount; i++) {
        options.passenger_travelClass.push(tc);
      }
    }
  }
  else if(tcLength === flightCount) {
    options.flightInfo_travelClass = options.travel_class;
    for(let fc = 0; fc < flightCount; fc++) {
      for(let pc = 0; pc < passengerCount; pc++) {
        options.passenger_travelClass.push(options.travel_class[fc]);  
      }
    }
  }
  else if(tcLength === (flightCount * passengerCount)) {
    options.passenger_travelClass = options.travel_class;
    let pc = passengerCount / flightCount;
    for(let fc = 0; fc < flightCount; fc++) {
      let idx = fc * pc;
      options.flightInfo_travelClass.push(options.travel_class[idx]);
    }
  }
  delete options.travel_class;
  // logger.debug(`setTravelClass: options dump: ${JSON.stringify(options)}`);
  return options;
}


ItineraryHandler.prototype.handle = function() {
  // we want the final destination, which is the arrival_city of the last element in flightInfo
  const lastFlightIdx = this.details.flight_info.length - 1;
  const destCity = this.details.flight_info[lastFlightIdx].arrival_airport.city;
  const leavingFrom = this.details.flight_info[0].departure_airport.city;
	let returnPromise;

  // for each passenger, find the trip, store itinerary and send notification
  this.details.passenger_info.forEach(info => {
    let tripFinder;
    try {
      tripFinder = new TripFinder(info.name, this.testing);
    }
    catch(e) {
      logger.error(`Error creating TripFinder: ${e.stack}. Moving on to next passenger!`);
      return;
    }
    logger.debug(`handle: Finding trip with start date ${this.departure_date} and city ${destCity}`);
    this.trip = tripFinder.getTrip(this.departure_date, destCity, leavingFrom);
    let file;
    let message;
    try {
      if(tripFinder.returnFlightItinerary) {
				// update the return date for this itinerary.
				this.trip.setReturnDate(this.departure_date);	
        file = this.trip.returnFlightFile();
        message = `Received return flight itinerary for your trip to ${this.trip.getPortOfEntry()}. Type 'return flight' to see your itinerary`;
      }
      else {
        file = this.trip.itineraryFile();
        // send a notification to the user that we have their details and will send them the boarding pass the day before the flight.
        message = `Received itinerary for your trip to ${this.trip.getPortOfEntry()}. Type 'flight' to see your itinerary`;
      }
			this.trip.markTodoItemDone("Flight tickets");
      fs.writeFileSync(file, JSON.stringify(this.details), 'utf8');
      // logger.debug(`handle: wrote ${JSON.stringify(this.details)} to file ${file}`);
      logger.debug(`handle: About to send message to user: ${message}`);
      tripFinder.getPostHandler().notifyUser(message);
			// Trigger an event so webhook-post-handler can set itinerary and weather details
			returnPromise = tripFinder.getPostHandler().setWeatherAndItineraryForNewTrip(this.trip.tripName);
    }
    catch(e) {
      logger.error(`parse: Error writing to file ${file}. ${e.stack}`);
      throw e;
    }
    logger.debug(`handle: Stored flight details, marked todo item as done and pushed notification`);
  }, this);

  return returnPromise;
}

function validate() {
  const requiredFields = ['template_type', 'intro_message', 'locale', 'pnr_number', 'passenger_info', 'flight_info', 'passenger_segment_info', 'total_price', 'currency'];
  requiredFields.forEach(field => {
    if(!this.details[field]) throw new Error(`Required field ${field} missing in details`);
  });

  // for itinerary, arrival_time is also mandatory
  this.details.flight_info.forEach((flightInfo,idx) => {
    if(!flightInfo.flight_schedule.arrival_time) throw new Error(`validate: required field flight_schedule.arrival_time is missing from flight_info (whose index is ${idx})`);
  });
}

function getPassengerInfo(options) {
  const info = [];
  for(let i = 0; i < options.names.length; i++) {
    const obj = {
      'name': options.names[i],
      'passenger_id': `p00${i+1}`
    };
    if(options.ticket_number) obj.ticket_number = options.ticket_number[i];
    info.push(obj);
  }
  if(info.length < 1) throw new Error(`getPassengerInfo: Atleast one passenger name expected in passed object (options)`);
  const piFields = ['name', 'passenger_id'];
  piFields.forEach(field => {
    info.forEach(passenger => {
      if(!passenger[field]) throw new Error(`Required field ${field} missing in details.passenger_info`);
    }, this);
  }, this);
  return info;
}

// for each person in passenger info and for each flight in flight_info, set the passenger's flight details
function getPassengerSegmentInfo(options) {
  const info = [];
  this.details.passenger_info.forEach((passenger,pIdx) => {
    this.details.flight_info.forEach(flight => {
      const fNum = flight.flight_number;
      const segInfo = {
        passenger_id: passenger.passenger_id,
        segment_id: flight.segment_id,
        // seat_type: flight.travel_class
      };
      const seats = options[`${fNum}_seats`];
      if(seats) {
        // if(!seats) throw new Error(`getPassengerSegmentInfo: cannot find seat info for flight ${fNum}`);
        // the ordering of seats is the same as ordering of names. 
        // eg. UA123_seats: ["3A", "4B"] indicates there are two passengers traveling on this flight. Passenger 1 (whose name corresponds to passenger_info[0])'s seat is 3A and passenger 2's seat is 4B.
        if(seats.length != options.names.length) throw new Error(`getPassengerSegmentInfo: number of seats ${seats.length} does not match name count ${options.names.length}`);
        segInfo.seat = seats[pIdx].seat;
        segInfo.seat_type = seats[pIdx].travel_class;
      }
      info.push(segInfo);
    }, this);
  }, this);
  return info;
}

module.exports = ItineraryHandler;
