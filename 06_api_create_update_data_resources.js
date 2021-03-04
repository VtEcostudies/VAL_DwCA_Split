/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DwCA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: 06_api_create_update_data_resources.js

  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gathered from GBIF

  ToDo:

  Notes:
  For each datasetKey, POST/PUT to the VAL API:
  https://collectory.vtatlasoflife.org/ws/{}/{}

  to create/update resources for dataset upload and ingestion:

  - dataResources

  Assumptions:
  - 01_occurrence_split has successfully run against occurrence.txt.
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value we can use to create
    dataResources
*/
const readline = require('readline');
const fs = require('fs');
const paths = require('./VAL_Utilities/00_config').paths;
const urls =  require('./VAL_Utilities/00_config').urls;
const Request = require('request');
const moment = require('moment');
const gbifApi = require('./VAL_Utilities/95_gbif_api_calls');
const valApi = require('./VAL_Utilities/94_val_api_calls');
const log = require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;

const splitDir = paths.splitDir; //path to directory to hold split GBIF DwCA
const logDir = paths.logDir
const logName = 'api_create_data_resources';

var dArr = []; //array of GBIF dataSet keys
var idx = 0; //file row index
var dryRun = false;
var dsKey = null; //GBIF dataSetKey
var drUid = null; //VAL dataResource UID
var dpUid = null; //VAL dataProvider UID
var inUid = null; //VAL Institution UID
var coUid = null; //VAL Collection UID

/*
  Now we wait for the log writeStream to emit an 'open' event before we begin.
*/
init(logName, logDir)
  .then(() => {
    log(`config paths: ${JSON.stringify(paths)}`);
    log(`config urls: ${JSON.stringify(urls)}`);

    //Get command-line args
    for (var i=0; i<process.argv.length; i++) {
      var all = process.argv[i].split('='); //the ith command-line argument
      var act = all[0]?all[0].toLowerCase():null; //action, left of action=argument
      var arg = all[1]?all[1].toLowerCase():null; //argument, right of action=argument
      log(`command-line argument ${i} | ${all}`);
    	switch(act) {
        case "dskey":
          dskey = arg;
          break;
    		case "druid":
          drUid = arg;
    			break;
        case "dpuid":
          dpUid = arg;
    			break;
        case "inuid":
          inUid = arg;
    			break;
        case "couid":
          coUid = arg;
    			break;
      }
    }

    if (drUid) {putValDRbyValUid(1, drUid, dpUid, inUid, coUid);}
    else if (dsKey) {putValDRbyGbifDatasetKey(1, dsKey, dpUid, inUid, coUid);}
    else {mainLoop();}
});

async function mainLoop() {
  log(`Getting GBIF datasetKeys from file.`);

  var dRead = readline.createInterface({
    input: fs.createReadStream(`${splitDir}/datasetKey_gbifArray.txt`)
  });

  //load the datasetKey_gbifArray file into local array
  dRead.on('line', function (row) {
    idx++;
    var arr = row.split(":");
    var mod = arr.slice(); //using .slice() copies by value, not by reference

    var dKey = mod[0];
    dArr[idx] = dKey;

    log(`read line: ${idx} datasetKey: ${dKey}`);
  });

  dRead.on('close', async function() {
    var gbifDS = null;
    var valDR = {};
    var valDP = {};
    /*
      Note: A simple for loop is synchronous, which is necessary for proper API updates.
    */
    for (var idx=1; idx < (dryRun?2:dArr.length); idx++) { //dryRun for testing...
      gbifDS = await gbifApi.getGbifDataset(idx, dArr[idx]);
      if (gbifDS) {
        log(`GBIF Dataset Title: ${gbifDS.title}`);
        valDR = await valApi.findValDataResource(idx, dArr[idx]); //find VAL DR by GBIF dataSetKey in guid field
        valDP = await valApi.findValDataProvider(idx, gbifDS.publishingOrganizationKey);
        //get GBIF Publisher and Installation info to create or update dataProvider
        gbifPO = await gbifApi.getGbifPublisher(idx, gbifDS.publishingOrganizationKey);
        gbifIL = await gbifApi.getGbifInstallation(idx, gbifDS.publishingOrganizationKey);
        if (valDP.uid) { //always update dataProvider
          await valApi.putValDataProvider(idx, gbifPO, gbifIL, valDP);
        } else { //no VAL DP found for dataSet. Create one.
          dpUid = await valApi.postValDataProvider(idx, gbifPO, gbifIL); //NOTE: This does not return a dpUid. Yet.
          valDP = await valApi.findValDataProvider(idx, gbifDS.publishingOrganizationKey);
        }
        if (valDR.uid) {
          log(`VAL Data Resource found | uid: ${valDR.uid} | name: ${valDR.name} | uri: ${valDR.uri}`);
          await valApi.putValDataResource(idx, dArr[idx], gbifDS, valDR, valDP.uid);
        } else {
          log('VAL Data Resource NOT found.');
          await valApi.postValDataResource(idx, dArr[idx], gbifDS, valDP.uid);
        }
        log(`------------------------------------------------------------------------`)
      }
    }
  });
}

async function putValDRbyValUid(idx=1, drUid=null, dpUid=null, inUid=null, coUid=null) {
  var valDR = {}; //VAL Data Resource object
  var valDP = {}; //VAL Data Provider object
  var gbifDS = {}; //GBIF DataSet object, retrieved by dataSetKey, which we put at valDR.guid
  var gbifPO = {}; //GBIF Publishing Organization, retrieved by
  var gbifIL = {}; //GBIf IPT Installation
  if (drUid) {valDR = await valApi.getValDataResource(idx, drUid);}
  if (valDR.guid) {gbifDS = await gbifApi.getGbifDataset(idx, valDR.guid);}
  if (gbifDS.key) {
    if (!dpUid) { //no VAL DP provided. Look for a VAL DP with that key.
      valDP = await valApi.findValDataProvider(idx, gbifDS.publishingOrganizationKey);
    } else {
      valDP = await valApi.getValDataProvider(idx, dpUid);
    }
    //get GBIF Publisher and Installation info to create or update dataProvider
    gbifPO = await gbifApi.getGbifPublisher(idx, gbifDS.publishingOrganizationKey);
    gbifIL = await gbifApi.getGbifInstallation(idx, gbifDS.publishingOrganizationKey);
    if (valDP.uid) { //always update dataProvider
      await valApi.putValDataProvider(idx, gbifPO, gbifIL, valDP);
    } else { //no VAL DP found for dataSet. Create one.
      dpUid = await valApi.postValDataProvider(idx, gbifPO, gbifIL); //NOTE: This does not return a dpUid. Yet.
      valDP = await valApi.findValDataProvider(idx, gbifDS.publishingOrganizationKey);
    }
    await valApi.putValDataResource(idx, valDR.guid, gbifDS, valDR, valDP.uid, inUid, coUid);
  }
}

async function putValDRbyGbifDatasetKey(idx=1, dsKey=null, dpUid=null, inUid=null, coUid=null) {
  var drUid = null;
  if (dsKey) {drUid = await valApi.findValDataResource(idx, dsKey);}
  if (drUid) {putValDRbyValUid(idx, drUid, dpUid, inUid, coUid);}
}
