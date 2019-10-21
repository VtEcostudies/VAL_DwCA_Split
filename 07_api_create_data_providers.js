/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: api_create_others.js

  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gathered from GBIF
  - Zip DwCA dataset files into archive named 'datasetKey.zip'
  - Upload DwCA archive to LA Collectory node public folder (eg. 'gbif_split')

  ToDo:
  - zip DwCA dataset files into archive named 'datasetKey.zip'
  - upload data file to the server for ingestion

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

console.log(`config paths: ${JSON.stringify(paths)}`);

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dArr = [];
var idx = 0; //file row index
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`)
});

//load the datasetKey_gbifArray file into local array
dRead.on('line', function (row) {
  idx++;
  var arr = row.split(":");
  var mod = arr.slice(); //using .slice() copies by value, not by reference

  var dpKey = mod[0];
  dArr[idx] = dpKey;

  console.log(`read line: ${idx} datasetKey: ${dpKey}`);
});

dRead.on('close', async function() {
  var gbifDataSet = null;
  var gbifPublOrg = null;
  var valDP = [];
  /*
    Main loop.

    Note: A simple for loop is synchronous, which is critical for proper API updates.
    I tried for days to make an asynchrous loop (array.forEach()) do synchronous
    stepwise API updates, and couldn't. A random search on Stack Overflow found
    a comment about synch vs async loop structure. Voila.

    We have to query the GBIF DataSet to get publishingOrganizationKey:
    getGbifDataset
      ==> extract publishingOrganizationKey
    getGbifPublisher

  */
  for (var idx=1; idx < dArr.length; idx++) {
    gbifDataSet = await getGbifDataset(idx, dArr[idx]);
    if (gbifDataSet) {
      if (gbifPublOrg) {
      console.log('GBIF Dataset Title:', gbifDataset.title);
      gbifPublOrg = await getGbifPublisher(idx, gbifDataset.publishingOrganizationKey);
      if (gbifPublOrg) {
        valDR = await findValDataResource(idx, gbifDataset.key);
        valDP = await findValDataProvider(idx, gbifPublOrg.key); //key is same as pubOrgKey from DataSet
        if (valDP.length == 0) {
          console.log('ALA Data Provider NOT found.');
          await postValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0]);
        } else if (valDP.length == 1) {
          console.log('ALA Data Provider UID:', valDP[0].uid);
          await putValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0], valDP[0]);
        } else {
          console.log(`ERROR: ALA Data Provider GUID ${dArr[idx]} has ${valDP.length} entries.`);
        }
      }
    }
  }
});

/*
  We use this to get publishingOrganizationKey from datasetKey
*/
function getGbifDataset(idx, dataSetKey) {
  var parms = {
    url: `http://api.gbif.org/v1/dataset/${dataSetKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      console.log(`GBIF Dataset | ${idx} | dataset | ${dataSetKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

//GBIF publishers are just Organizations having credentials?
//http://api.gbif.org/v1/organization/b6d09100-919d-4026-b35b-22be3dae7156
function getGbifPublisher(idx, orgKey) {
  var parms = {
    url: `http://api.gbif.org/v1/organization/${orgKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      console.log(`GBIF Publisher | ${idx} | Organization | ${orgKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
      } else {
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
function findValDataProvider(idx, dpKey) {
  var parms = {
    url: `${urls.collectory}/ws/dataProvider?guid=${dpKey}`,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.get(parms, (err, res, body) => {
      console.log(`GET VAL Data Provider | ${idx} | DataProvider | ${dpKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

function postValDataProvider(idx, dpKey, gbif, valDR) {
  var pBody = gbifToValDataset(gbif, valDR); //POST Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.post(parms, (err, res, body) => {
      console.log(`POST ALA Data Resource | ${idx} | dataset | ${dpKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

function putValDataProvider(idx, datasetKey, gbif, valDR, valDP) {
  var pBody = gbifToValDataset(gbif, valDR, valDP); //PUT Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider/${valDP.uid}`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.put(parms, (err, res, body) => {
      console.log(`PUT VAL Data Provider | ${idx} | dataset | ${datasetKey} | dataProvider | ${valDP.uid} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        reject(err);
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
  gbif: the result from GBIF Org API
  valDR: the result from VAL dataResource api for one GBIF dataSet GUID
  valDP: the result from VAL dataProvider api

NOTE: we may need to append DRs in valDR to DRs in valDP.
*/

function gbifToValDataProvider(gbif, valDR={}, valDP={}) {
  // Don't change all nulls to empty strings (""). Some fields require null or non-empty string.
  var valDP = {
    "name":gbif.title, //"Vermont Center for Ecostudies",
    "acronym":"",//"VCE",
    //"uid":"dp0",
    "guid":gbif.key,
    "address":gbif.address[0] + gbif.city + gbif.province + gbif.postalCode + gbif.country,
    "phone":gbif.phone,
    "email":gbif.email,
    "pubShortDescription":null,
    "pubDescription":gbif.description,
    "techDescription":null,
    "focus":null,
    "state":null,
    "websiteUrl":"http://ipt.vtecostudies.org",
    //"alaPublicUrl":"https://collectory.vtatlasoflife.org/public/show/dp0",
    "networkMembership":null,
    "attributions":[],
    //"dateCreated":"2019-10-07T15:01:53Z",
    //"lastUpdated":"2019-10-07T17:34:42Z",
    //"userLastModified":"jloomis@vtecostudies.org",
    "dataResources":[
      {
        "name":"Records of Hawk Moths (Sphingidae) from Vermont, USA",
        "uri":"https://collectory.vtatlasoflife.org/ws/dataResource/dr410",
        "uid":"dr410"//,
        //"id":430
      }
    ],
    "gbifRegistryKey":gbif.key
  };


  valDP.dataResources.push({
    name:valDR.name,
    uri:valDR.uri,
    uid:valDR.uid
  });

  return valDP;
}
