/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource,
  and to ingest each provider of those datasets as well.

  File: api_create_data_providers.js

  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - extract publishingOrganizationKey from dataset
  - Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gathered from GBIF
  - Zip DwCA dataset files into archive named 'datasetKey.zip'
  - Upload DwCA archive to LA Collectory node public folder (eg. 'gbif_split')

  Notes:
  In the future, we can also iterate over dataProviders, if we have stored their orgKey, and list
  all datasets:

  eg. https://api.gbif.org/v1/dataset/search?publishingOrg=b6d09100-919d-4026-b35b-22be3dae7156

  Notes:
  For each datasetKey, POST/PUT to the VAL API:

  val-docker (spring of 2019):
  http://beta.vtatlasoflife.org/collectory/ws/{resourceType}/{typeId}

  val-ansible-production (fall of 2019):
  https://collectory.vtatlasoflife.org/ws/{}/{}

  to create/update resources for dataset upload and ingestion:

  - dataProviders

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in citation.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value we can use to create
    citation.txt (and others)
*/
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;
var urls =  require('./00_config').urls;
var Request = require('request');
const moment = require('moment');

console.log(`config paths: ${JSON.stringify(paths)}`);

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files
var logFile = `${moment().format('YYYYMMDD-HHMMSS')}_api_create_providers.log`;
var logToConsole = true; //console logging is OK here, speed is dictated by synchronous API calls
var wStream = [];
var dArr = [];
var idx = 0; //file row index

var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`)
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
  var gbifDataset = null;
  var gbifPublOrg = null;
  var gbifInstall = null; //gbif API IPT data
  var valDR = [];
  var valDP = [];
  /*
    Main loop.

    Note: A simple for loop is synchronous, which is critical for proper API updates.
    I tried for days to make an asynchrous loop (array.forEach()) do synchronous
    stepwise API updates, and couldn't. A random search on Stack Overflow found
    a comment about synch vs async loop structure. Voila.

    We have to query the GBIF DataSet to get publishingOrganizationKey:
    GetGbifDataset
      ==> extract publishingOrganizationKey
    GetGbifPublisher

  */
  for (var idx=1; idx < dArr.length; idx++) {
  //for (var idx=1; idx < 2; idx++) { //array result is 1-based
    console.log(dArr[idx]);
    gbifDataset = await GetGbifDataset(idx, dArr[idx]);
    if (gbifDataset) {
      log('GBIF Dataset Title:', gbifDataset.title);
      gbifPublOrg = await GetGbifPublisher(idx, gbifDataset.publishingOrganizationKey);
      if (gbifPublOrg) {
        valDR = await FindValDataResource(idx, gbifDataset.key);
        valDP = await FindValDataProvider(idx, gbifPublOrg.key); //key is same as pubOrgKey from DataSet
        if (valDP.length) {
          valDP = await GetValDataProvider(idx, valDP[0].uid); //returns a single object, not an array
        }
        gbifInstall = await GetGbifInstallation(idx, gbifPublOrg.key);
        if (valDR.length > 0) {
          if (valDP.uid) {
            log('->PUT to VAL Data Provider UID:', valDP.uid);
            await PutValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0], valDP, gbifInstall);
          } else {
            log(`-->POST to VAL. VAL Data Provider for GBIF publisher ${gbifPublOrg.key} NOT found.`);
            await PostValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0], gbifInstall);
          }
        } else {
          log(`VAL Data Resource for datasetKey ${gbifDataset.key} aka ${dArr[idx]} not found.`);
        }
      }
    }
  }
});

/*
  We use this to get publishingOrganizationKey from datasetKey
  eg. https://api.gbif.org/v1/dataset/f2faaa4c-74e9-457a-8265-06ef5cc73626
*/
function GetGbifDataset(idx, dataSetKey) {
  var parms = {
    url: `http://api.gbif.org/v1/dataset/${dataSetKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`GetGbifDataset | ${idx} | Dataset Key | ${dataSetKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

/*
  GBIF publishers are just Organizations having datasets published:

  http://api.gbif.org/v1/organization/b6d09100-919d-4026-b35b-22be3dae7156

*/
function GetGbifPublisher(idx, orgKey) {
  var parms = {
    url: `http://api.gbif.org/v1/organization/${orgKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`GBIF Publisher | ${idx} | Organization Key | ${orgKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        log(`GetGbifPublisher`, err);
        reject([]); //return empty array to allow process to proceed. not critical.
      } else {
        resolve(body);
      }
    });
  });
}

/*
  Some GBIF publishing organizations have IPT installations, some do not.

  Get installation data from organization like this:

  http://api.gbif.org/v1/organization/b6d09100-919d-4026-b35b-22be3dae7156/installation

  ...and return an array of installations (unfortunately).

  The above gets the same results as:

  http://api.gbif.org/v1/installation/5ae8b93d-03d9-48f1-8334-f1f251d13f1f

*/
function GetGbifInstallation(idx, orgKey) {
  var parms = {
    url: `http://api.gbif.org/v1/organization/${orgKey}/installation`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      log(`GetGbifInstallation | ${idx} | Organization | ${orgKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        log(`GetGbifInstallation`, err);
        reject([]); //return empty array to allow process to proceed. not critical.
      } else {
        resolve(body);
      }
    });
  });
}


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
        reject(err);
      } else if (res.statusCode > 299) {
        log(`FindValDataResource | ${idx} | GBIF DatasetKey: ${dataSetKey} | Bad Result: ${res} | Req Params:`);
        console.dir(parms);
        reject(res);
      } else {
        log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} | body:`);
        body = body || [];
        console.dir(body);
        resolve(body);
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
        reject([]);
      } else if (res.statusCode > 299) {
        log(`FindValDataProvider | ${idx} | GBIF Org Key: ${orgKey} | Bad Result: ${res} | Req Params:`);
        console.dir(parms);
        reject(res);
      } else {
        log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} | body:`);
        body = body || [];
        console.dir(body);
        resolve(body);
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

function PostValDataProvider(idx, datasetKey, gbifOrg, valDR, gbifIpt=[]) {

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

function PutValDataProvider(idx, datasetKey, gbifOrg, valDR, valDP, gbifIpt=[]) {
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
https://www.gbif.org/publisher/b6d09100-919d-4026-b35b-22be3dae7156
http://api.gbif.org/v1/organization/b6d09100-919d-4026-b35b-22be3dae7156
inputs:
  gbifOrg: the result from GBIF Org API
  gbitIpt: the result from GBIF Ipt API

NOTE: A POST or PUT will fail if any single field is incorrect.
*/

//function GbifToValDataProvider(gbifOrg, valDR={}, valDP={}, gbifIpt=[]) {
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
