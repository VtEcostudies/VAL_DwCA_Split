/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DwCA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: 06_api_create_update_data_resources_and_providers.js

  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - GET GBIF datasetKey dependent data (not all was added to the original aggregate download)
  - GET GBIF PublishingOrganization info for dataset
  - GET GBIF Installation info for dataset
  - POST or PUT LA Collectory dataProvider
  - POST or PUT LA Collectory dataResource (with dP->dR dependency links!)

  Notes:
  For each datasetKey, POST/PUT to the VAL API:
  https://collectory.vtatlasoflife.org/ws/{}/{}

  to create/update resources for dataset upload and ingestion:

  - dataProviders
  - dataResources

  Assumptions:
  - 01_occurrence_split has successfully run against occurrence.txt.
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value we can use to create
    dataResources
*/
const readline = require('readline');
const fs = require('fs');
const paths = require('./00_config').paths;
const urls =  require('./00_config').urls;
const Request = require('request');
const moment = require('moment');
const gbifApi = require('./VAL_Utilities/95_gbif_api_calls');
const valApi = require('./VAL_Utilities/94_val_api_calls');
const log = require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;

const splitDir = paths.splitDir; //path to directory to hold split GBIF DwCA
const logDir = paths.logDir
const logName = 'api_create_data_resources';

const idxPath = `${paths.splitDir}/api_create_last_index.json`; //keep track of the last index and dsKey processed to pick-up on error
var idxStream = null; //write stream for the file at idxPath

var dArr = []; //array of GBIF dataSet keys
var idx = 0; //file row index
var dryRun = false;
var dsKey = null; //GBIF dataSetKey
var drUid = null; //VAL dataResource UID
var dpUid = null; //VAL dataProvider UID
var inUid = null; //VAL Institution UID
var coUid = null; //VAL Collection UID

process.on('exit', function(code) {
  console.log('dKeyArray length:', dArr.length, 'index:', idx, 'writeStream:', null!=idxStream);
  if (dArr.length == idx && idxStream) {
    //clear the marker file
    idxStream.close();
    idxStream = fs.createWriteStream(idxPath, {flags:'w'});
  }
  return log(1,`Exiting with code ${code}.`, 'index:', idx, 'datasetKey:', dArr[idx-1]);
});

/*
  Now we wait for the log init's createWriteStream to emit an 'open' or 'error' event before we begin.
*/
init(logName, logDir) //init's error does not throw error, allowing this to proceed on error
  .then(() => {
    log(1,'config paths', paths);
    log(1,'config urls', urls);

    //Get command-line args
    for (var i=0; i<process.argv.length; i++) {
      var all = process.argv[i].split('='); //the ith command-line argument
      var act = all[0]?all[0].toLowerCase():null; //action, left of action=argument
      var arg = all[1]?all[1].toLowerCase():null; //argument, right of action=argument
      log(1,`command-line argument`, i, all);
    	switch(act) {
        case "dskey":
          dsKey = arg;
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
    else if (dsKey) {
      //putValDRbGbifDatasetKey(1, dsKey, dpUid, inUid, coUid);
      handleGbifDatasetKey(1, dsKey);
    }
    else {mainLoop();}
});

async function mainLoop() {
  log(1,`Getting GBIF datasetKeys from file.`);

  var dRead = readline.createInterface({
    input: fs.createReadStream(`${splitDir}/datasetKey_gbifArray.txt`)
  });

  //load the datasetKey_gbifArray file into local array
  dRead.on('line', function (row) {
    //idx++; // 1-based array?
    var arr = row.split(":");
    var mod = arr.slice(); //using .slice() copies by value, not by reference

    var dKey = mod[0];
    dArr[idx++] = dKey;

    log(1,`read line`, idx, 'datasetKey', dKey);
  });

  dRead.on('close', async function() {
    var gbifDS = null;
    var valDR = {};
    var valDP = {};
    var objRead = null;
    var idxPrev = 0;
    var keyPrev = '';

    log(1,`Getting last index and datasetKey marker from file:`, idxPath);
    try {objRead = fs.readFileSync(idxPath, 'utf8');} catch(err) {log(1, err);}
    log(1, `Marker file read result`, objRead);
    if (objRead) {
      objRead = JSON.parse(objRead);
      idxPrev = objRead.idx;
      keyPrev = objRead.datasetKey;
    }
    log(1, 'idx', idxPrev, 'key', `"${keyPrev}"`);

    log(1,`Creating write stream to last index and datasetKey marker file:`, idxPath);
    try {idxStream = fs.createWriteStream(idxPath, {flags:'w'});} catch(err) {idxStream = null; log(1, err);}

    /*
      Note: A simple for loop is synchronous, which is necessary for proper API updates.
    */
    for (idx=idxPrev+1; idx < (dryRun?2:dArr.length); idx++) { //dryRun for testing...
      await handleGbifDatasetKey(idx, dArr[idx]);
      if (idxStream) { //only works with synchronous await call to handleGbifDatasetKey...
        idxStream.close();
        idxStream = fs.createWriteStream(idxPath);
        idxStream.write(`{"idx":${idx}, "datasetKey":"${dArr[idx]}"}`);
      }
      //handleGbifDatasetKey(idx, dArr[idx]); //waaayy faster, and seems to work
    }
  });
}

async function handleGbifDatasetKey(idx, dsKey) {
  var gbifDS = null;
  var valDR = {};
  var valDP = {};
  var gbifPO = {}; //GBIF Publishing Organization, retrieved by
  var gbifIL = {}; //GBIf IPT Installation
  gbifDS = await gbifApi.getGbifDataset(idx, dsKey);
  if (gbifDS) {
    log(1,`GBIF Dataset Title`, gbifDS.title);
    valDR = await valApi.findValDataResource(idx, dsKey); //find VAL DR by GBIF dataSetKey in guid field
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
      log(1,`VAL Data Resource found`, 'uid', valDR.uid, 'name', valDR.name, 'uri', valDR.uri);
      await valApi.putValDataResource(idx, dsKey, gbifDS, valDR, valDP.uid);
    } else {
      log(1,'VAL Data Resource NOT found');
      await valApi.postValDataResource(idx, dsKey, gbifDS, valDP.uid);
    }
    log(1,`------------------------------------------------------------------------`)
  }
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
  var drVal = null;
  if (dsKey) {drVal = await valApi.findValDataResource(idx, dsKey);}
  if (drVal.uid) {putValDRbyValUid(idx, drUid, dpUid, inUid, coUid);}
}
