/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource,
  and to ingest each provider of those datasets as well.

  File: 07_api_create_data_providers.js

  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - extract publishingOrganizationKey from dataset
  - Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gathered from GBIF

  Notes:
  In the future, we can also iterate over dataProviders, if we have stored their orgKey, and list
  all datasets:

  eg. https://api.gbif.org/v1/dataset/search?publishingOrg=b6d09100-919d-4026-b35b-22be3dae7156

  Notes:
  For each datasetKey, POST/PUT to the VAL API:

  https://collectory.vtatlasoflife.org/ws/{}/{}

  to create/update resources for dataset upload and ingestion:

  - dataProviders

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value
*/
const readline = require('readline');
const fs = require('fs');
const moment = require('moment');
const paths = require('./VAL_Utilities/00_config').paths;
const urls =  require('./VAL_Utilities/00_config').urls;
const Request = require('request');
const gbifApi = require('./VAL_Utilities/95_gbif_api_calls');
const valApi = require('./VAL_Utilities/94_val_api_calls');

const splitDir = paths.splitDir; //path to directory to hold split GBIF DWcA
const logDir = paths.logDir
const logName = 'api_create_providers';
const logFile = `${moment().format('YYYYMMDD-hhmmss')}_${logName}.log`;
var logToConsole = true; //console logging is OK here, speed is dictated by synchronous API calls
var logStream = null;
var dArr = [];
var idx = 0; //file row index

log(`config paths: ${JSON.stringify(paths)}`);

var dRead = readline.createInterface({
  input: fs.createReadStream(`${splitDir}/datasetKey_gbifArray.txt`)
});

//load the datasetKey_gbifArray file into local array
dRead.on('line', function (row) {
  idx++; //array starts at 1
  var arr = row.split(":");
  var mod = arr.slice(); //using .slice() copies by value, not by reference

  var dpKey = mod[0];
  dArr[idx] = dpKey; //array starts at 1

  //console.log(`read line: ${idx} datasetKey: ${dpKey}`);
});

dRead.on('close', async function() {
  var gbifDataset = null; //a dataSet having occurrences in VT
  var gbifPublOrg = null; //the GBIF org that published a dataSet
  var gbifInstall = null; //the GBIF IPT that published a dataSet
  //var valDR = {};
  var valDP = {};
  /*
    Main loop.

    Note: A simple for loop is synchronous, which is critical for proper API updates.
    I tried for days to make an asynchrous loop (array.forEach()) do synchronous
    stepwise API updates, and couldn't. A random search on Stack Overflow found
    a comment about synch vs async loop structure. Voila.

    We query the GBIF DataSet to get publishingOrganizationKey:
    GetGbifDataset
      ==> extract publishingOrganizationKey
    GetGbifPublisher

    We map 'Publishing Organization' to VAL/ALA dataProvider.

  */
  for (var idx=1; idx < dArr.length; idx++) {
  //for (var idx=1; idx < 2; idx++) { //array result is 1-based
    log(`dArr[idx]`, logstream);
    gbifDataset = await GetGbifDataset(idx, dArr[idx]);
    if (gbifDataset) {
      log('GBIF Dataset Title:', gbifDataset.title);
      gbifPublOrg = await gbifApi.GetGbifPublisher(idx, gbifDataset.publishingOrganizationKey);
      if (gbifPublOrg) {
        //valDR = await FindValDataResource(idx, gbifDataset.key);
        valDP = await FindValDataProvider(idx, gbifPublOrg.key); //key is same as pubOrgKey from DataSet
        /*
        if (valDP.uid) {
          valDP = await GetValDataProvider(idx, valDP.uid); //returns a single object, not an array
        }
        */
        gbifInstall = await GetGbifInstallation(idx, gbifPublOrg.key);
        //if (valDR.uid) {
          if (valDP.uid) {
            log('->PUT to VAL Data Provider UID:', valDP.uid);
            await PutValDataProvider(idx, gbifPublOrg, gbifInstall, valDP);
          } else {
            log(`-->POST to VAL. VAL Data Provider for GBIF publisher ${gbifPublOrg.key} NOT found.`);
            await PostValDataProvider(idx, gbifPublOrg, gbifInstall);
          }
        //} else {
        //  log(`VAL Data Resource for datasetKey ${gbifDataset.key} aka ${dArr[idx]} not found.`);
        }
      } else {
        log(`publishingOrganizationKey NOT FOUND for ${gbifDataset.key} | ${gbifDataset.title}`);
      }
    } else {
      log(`Dataset not found for ${dArr[idx]}`);
    }
  }
});

/*
  Return single object, empty or filled.
*/
function FindValDataResource(idx, dataSetKey) {
  var parms = {
    url: `${urls.collectory}/ws/dataResource?guid=${dataSetKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} | ${res.statusCode}`);
      if (err) {
        log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} Error:`, err);
        reject({});
      } else if (res.statusCode > 299) {
        log(`FindValDataResource | ${idx} | GBIF DatasetKey: ${dataSetKey} | Bad Result: ${res} | Req Params:`);
        console.dir(parms);
        reject({});
      } else if (1 == body.length) {
        log(`FindValDataResource | ${idx} | GBIF DatasetKey: ${dataSetKey} | result: ${body[0]}`);
        resolve(body[0]);
      } else {
        log(`FindValDataResource ERROR | ${idx} | GBIF DatasetKey: ${dataSetKey} | FOUND ${body.length} items.`);
        reject ({});
      }
    });
  });
}

/*
A successul VAL guid search for dataProvider will return 3 values:

[{
"name":"Vermont Center for Ecostudies",
"uri":"https://collectory.vtatlasoflife.org/ws/dataProvider/dp0",
"uid":"dp0"
}]
return a single object or error
*/
function FindValDataProvider(idx, orgKey) {
  var parms = {
    url: `${urls.collectory}/ws/dataProvider?guid=${orgKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} | ${res.statusCode}`);
      if (err) {
        log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} Error:`, err);
        reject({});
      } else if (res.statusCode > 299) {
        log(`FindValDataProvider | ${idx} | GBIF Org Key: ${orgKey} | Bad Result: ${res} | Req Params:`);
        reject({});
      } else if (1 == body.length) {
        log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} | result: ${body[0]}`);
        resolve(body[0]);
      } else {
        log(`FindValDataProvider ERROR | ${idx} | GBIF Org Key | ${orgKey} | FOUND ${body.length} items.`);
        reject ({});
      }
    });
  });
}

function GetValDataProvider(idx, uid) {
  var parms = {
    url: `${urls.collectory}/ws/dataProvider/${uid}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`GetValDataProvider | ${idx} | VAL uid  | ${uid} | ${res.statusCode} | body: `);
      console.dir(body);
      if (err) {
        log(`GetValDataProvider | ${idx} | VAL uid | ${uid} Error:`, err);
        reject([]);
      } else if (res.statusCode > 299) {
        log(`GetValDataProvider | ${idx} | VAL uid: ${uid} | Bad Result: ${res} | Req Params:`);
        console.dir(parms);
        reject(res);
      } else {
        body = body || [];
        resolve(body);
      }
    });
  });
}

function PostValDataProvider(idx, gbifOrg, gbifIpt=[]) {

  var pBody = GbifToValDataProvider(gbifOrg, gbifIpt); //POST Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.post(parms, (err, res, body) => {
      log(`PostValDataProvider | ${idx} | GBIF Org Key | ${gbifOrg.key} | ${res.statusCode}`);
      if (err) {
        log(`PostValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} Error:`, err);
        reject(err);
      } else if (res.statusCode > 299) {
        log(`PostValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title}| Bad Result: ${res.statusCode} | Req Params:`);
        console.dir(parms);
        reject(res);
      } else {
        resolve(body);
      }
    });
  });
}

function PutValDataProvider(idx, gbifOrg, gbifIpt=[], valDP) {
  var pBody = {};
  pBody = GbifToValDataProvider(gbifOrg, gbifIpt); //PUT Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider/${valDP.uid}`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.put(parms, (err, res, body) => {
      log(`PutValDataProvider | ${idx} | GBIF Org Key | ${gbifOrg.key} | VAL dataProvider: ${valDP.uid} | ${res.statusCode}`);
      if (err) {
        log(`PutValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} | VAL dataProvider: ${valDP.uid} Error:`, err);
        reject(err);
      } else if (res.statusCode > 299) {
        log(`PutValDataProvider | ${idx} | VAL dataProvider: ${valDP.uid} | Bad Result: ${res.statusCode} | Req Params:`);
        console.dir(parms);
        reject(res);
      } else {
        resolve(body);
      }
    });
  });
}

/*
UI: https://www.gbif.org/publisher/b6d09100-919d-4026-b35b-22be3dae7156
API: http://api.gbif.org/v1/organization/b6d09100-919d-4026-b35b-22be3dae7156
inputs:
  gbifOrg: the result from GBIF Org API
  gbitIpt: the result from GBIF Ipt API

NOTE: A POST or PUT will fail if any single field is incorrect.
*/

function GbifToValDataProvider(gbifOrg, gbifIpt=[], valDP={}) {
    // Don't change all nulls to empty strings (""). Some fields require null or non-empty string.
    valDP.name = gbifOrg.title;
    valDP.acronym = "";//"VCE",
    valDP.guid = gbifOrg.key;
    //valDP.address = gbifOrg.address;
    //valDP.state = gbifOrg.province?gbifOrg.province:'';
    //valDP.city = gbifOrg.city;
    //valDP.postCode = gbifOrg.postalCode;
    //valDP.country gbifOrg.country;
    valDP.latitude = gbifOrg.latitude;
    valDP.longitude = gbifOrg.longitude;
    valDP.phone = gbifOrg.phone[0];
    valDP.email = gbifOrg.email[0];
    valDP.pubShortDescription = '';
    valDP.pubDescription = gbifOrg.description;
    valDP.techDescription = '';
    valDP.focus = '';
    //default to homePage, then IPT endpoint
    if (gbifOrg.homepage[0]) {
      valDP.websiteUrl = gbifOrg.homepage[0];
    } else if (gbifIpt.length > 0) {
      valDP.websiteUrl = gbifIpt.url.endpoints[0].url; //"http://ipt.vtecostudies.org";
    }
    //valDP.attribution = "";
    valDP.gbifRegistryKey = gbifOrg.key;

  return valDP;
}

async function log(txt, override=false) {
  try {
    if (logToConsole || override) {console.log(txt);}
    if (!wStream['log']) {
      wStream['log'] = await fs.createWriteStream(`../split-logs/${logFile}`);
    }
    if (typeof txt == 'object') { //handles arrays and objects
      var obj = txt;
      txt = '';
      for (key in obj) {
        txt += `${key}:${obj[key]}\n`;
      }
    }
    wStream['log'].write(txt + '\n');
  } catch(error) {
    console.log(`log error: ${error}`);
  }
}
