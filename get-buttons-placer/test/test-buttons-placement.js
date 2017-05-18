'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const ButtonsPlacement = require('get-buttons-placer/app/buttons-placement');
const FbidHandler = require('fbid-handler/app/handler');
const baseDir = "/home/ec2-user";
const TripData = require(`${baseDir}/trip-data`);
const logger = require(`${baseDir}/my-logger`);
logger.setTestConfig(); // indicate that we are logging for a test


describe('testing buttons placement', function() {
  let fbid = "12345";
  const tripName = "trip";
  //set up
  beforeEach(function() {
    // create a test file and pass that to fbid-handler
    logger.debug("Setting up before test");
    FbidHandler.get('fbid-test.txt').testing_add(fbid,{first_name: "TestFirstname", last_name: "Lastname"});
  });

  // clean up
  afterEach(function() {
    logger.debug("Cleaning up after test");
    (new TripData(tripName, fbid)).testing_delete();
  });

  it('no boarding pass and itinerary', function() {
    const result = new ButtonsPlacement("https://polaama.com/WBkW", new TripData(tripName, fbid, "fbid-test.txt")).getPlacement();
    // logger.debug(`${JSON.stringify(result, null, 2)}`);
    expect(Object.keys(result).length).to.equal(3);
    expect(result.firstSet).to.be.ok;
    expect(result.firstSet.length).to.equal(3);
    expect(result.firstSet[0].title).to.equal("Trip calendar");
    expect(result.firstSet[1].title).to.equal("Weather");
    expect(result.firstSet[2].title).to.equal("Activities");
    expect(result.secondSet.length).to.equal(3);
    expect(result.secondSet[0].title).to.equal("Comments");
    expect(result.secondSet[1].title).to.equal("Todo list");
    expect(result.secondSet[2].title).to.equal("Pack list");
    expect(result.thirdSet.length).to.equal(2);
    expect(result.thirdSet[0].title).to.equal("Expense report");
    expect(result.thirdSet[1].title).to.equal("Flight");
  });

  it('itinerary and no boarding pass', function() {
    const trip = new TripData(tripName, "12345", "fbid-test.txt");
    fs.writeFileSync(trip.itineraryFile(), "empty");
    const result = new ButtonsPlacement("https://polaama.com/WBkW", new TripData(tripName, fbid, "fbid-test.txt")).getPlacement();
    // logger.debug(`${JSON.stringify(result, null, 2)}`);
    expect(Object.keys(result).length).to.equal(3);
    expect(result.firstSet).to.be.ok;
    expect(result.firstSet.length).to.equal(3);
    expect(result.firstSet[0].title).to.equal("Itinerary");
    expect(result.firstSet[1].title).to.equal("Trip calendar");
    expect(result.firstSet[2].title).to.equal("Weather");
    expect(result.secondSet.length).to.equal(3);
    expect(result.secondSet[0].title).to.equal("Activities");
    expect(result.secondSet[1].title).to.equal("Comments");
    expect(result.secondSet[2].title).to.equal("Todo list");
    expect(result.thirdSet.length).to.equal(3);
    expect(result.thirdSet[0].title).to.equal("Pack list");
    expect(result.thirdSet[1].title).to.equal("Expense report");
    expect(result.thirdSet[2].title).to.equal("Flight");
  });

  it('both itinerary and boarding pass present', function() {
    const trip = new TripData(tripName, "12345", "fbid-test.txt");
    fs.writeFileSync(trip.itineraryFile(), "empty");
    fs.writeFileSync(trip.boardingPassFile(), "empty");
    const result = new ButtonsPlacement("https://polaama.com/WBkW", new TripData(tripName, fbid, "fbid-test.txt")).getPlacement();
    // logger.debug(`${JSON.stringify(result, null, 2)}`);
    expect(Object.keys(result).length).to.equal(3);
    expect(result.firstSet).to.be.ok;
    expect(result.firstSet.length).to.equal(3);
    expect(result.firstSet[0].title).to.equal("Boarding pass");
    expect(result.firstSet[1].title).to.equal("Itinerary");
    expect(result.firstSet[2].title).to.equal("Trip calendar");
    expect(result.secondSet.length).to.equal(3);
    expect(result.secondSet[0].title).to.equal("Weather");
    expect(result.secondSet[1].title).to.equal("Activities");
    expect(result.secondSet[2].title).to.equal("Comments");
    expect(result.thirdSet.length).to.equal(3);
    expect(result.thirdSet[0].title).to.equal("Todo list");
    expect(result.thirdSet[1].title).to.equal("Pack list");
    expect(result.thirdSet[2].title).to.equal("Expense report");
  });
});