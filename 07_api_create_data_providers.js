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
    gbifDataset = await GetGbifDataset(idx, dArr[idx]);
    if (gbifDataset) {
      console.log('GBIF Dataset Title:', gbifDataset.title);
      gbifPublOrg = await GetGbifPublisher(idx, gbifDataset.publishingOrganizationKey);
      if (gbifPublOrg) {
        valDR = await FindValDataResource(idx, gbifDataset.key);
        valDP = await FindValDataProvider(idx, gbifPublOrg.key); //key is same as pubOrgKey from DataSet
        if (valDP.length) {
          valDP = await GetValDataProvider(idx, valDP[0].uid);
        }
        gbifInstall = await GetGbifInstallation(idx, gbifPublOrg.key);
        if (valDR.length > 0) {
          if (valDP.length == 0) {
            console.log('VAL Data Provider NOT found.');
            await PostValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0], gbifInstall);
          } else if (valDP.length == 1) {
            console.log('VAL Data Provider UID:', valDP[0].uid);
            await PutValDataProvider(idx, dArr[idx], gbifPublOrg, valDR[0], valDP[0], gbifInstall);
          } else {
            console.log(`ERROR: VAL Data Provider GUID ${dArr[idx]} has ${valDP.length} entries.`);
          }
        } else {
          console.log(`VAL Data Resource for datasetKey ${gbifDataset.key} aka ${dArr[idx]} not found.`);
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
      console.log(`GetGbifDataset | ${idx} | Dataset Key | ${dataSetKey} | ${res.statusCode}`);
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
      console.log(`GBIF Publisher | ${idx} | Organization Key | ${orgKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        console.log(`GetGbifPublisher`, err);
        reject([]); //return empty array to allow process to proceed. not critical.
      } else {
        resolve(body);
      }
    });
  });
}

/*
  GBIF organizations have IPT installations if they've published datasets. Get
  installation data from organization like this:

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
      console.log(`GetGbifInstallation | ${idx} | Organization | ${orgKey} | ${res.statusCode}`);
      if (err || res.statusCode > 399) {
        console.log(`GetGbifInstallation`, err);
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
      console.log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} | ${res.statusCode}`);
      if (err) {
        console.log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} Error:`, err);
        reject(err);
      } else if (res.statusCode > 299) {
        console.log(`FindValDataResource | ${idx} | GBIF DatasetKey: ${dataSetKey} | Bad Result: ${res} | Request Params:`);
        console.dir(parms);
        reject(res);
      } else {
        console.log(`FindValDataResource | ${idx} | Dataset Key | ${dataSetKey} | body:`);
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
      console.log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} | ${res.statusCode}`);
      if (err) {
        console.log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} Error:`, err);
        reject([]);
      } else if (res.statusCode > 299) {
        console.log(`FindValDataProvider | ${idx} | GBIF Org Key: ${orgKey} | Bad Result: ${res} | Request Params:`);
        console.dir(parms);
        reject(res);
      } else {
        console.log(`FindValDataProvider | ${idx} | GBIF Org Key | ${orgKey} | body:`);
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
      console.log(`GetValDataProvider | ${idx} | VAL uid  | ${uid} | ${res.statusCode}`);
      if (err) {
        console.log(`GetValDataProvider | ${idx} | VAL uid | ${uid} Error:`, err);
        reject([]);
      } else if (res.statusCode > 299) {
        console.log(`GetValDataProvider | ${idx} | VAL uid: ${uid} | Bad Result: ${res} | Request Params:`);
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

  var pBody = GbifToValDataProvider(gbifOrg, valDR, gbifIpt); //POST Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.post(parms, (err, res, body) => {
      console.log(`PostValDataProvider | ${idx} | GBIF Org Key | ${gbifOrg.key} | ${res.statusCode}`);
      if (err) {
        console.log(`PostValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} Error:`, err);
        reject(err);
      } else if (res.statusCode > 299) {
        console.log(`PostValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} Bad Result | Request:`);
        console.dir(parms);
        console.dir(body);
        reject(res);
      } else {
        console.log(`PostValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} Error:`, err);
        reject(err);
        resolve(body);
      }
    });
  });
}

function PutValDataProvider(idx, datasetKey, gbifOrg, valDR, valDP, gbifIpt=[]) {

  var pBody = GbifToValDataProvider(gbifOrg, valDR, valDP, gbifIpt); //PUT Body - create data format for LA Collectory from GBIF

  var parms = {
    url: `${urls.collectory}/ws/dataProvider/${valDP.uid}`,
    body: pBody,
    json: true
  };

  return new Promise((resolve, reject) => {
    Request.put(parms, (err, res, body) => {
      console.log(`PutValDataProvider | ${idx} | GBIF Org Key | ${gbifOrg.key} | VAL dataProvider: ${valDP.uid} | ${res.statusCode}`);
      if (err) {
        console.log(`PutValDataProvider | ${idx} | GBIF Org | ${gbifOrg.title} | VAL dataProvider: ${valDP.uid} Error:`, err);
        reject(err);
      } else if (res.statusCode > 299) {
        console.log(`PutValDataProvider | ${idx} | VAL dataProvider: ${valDP.uid} | Bad Result: ${res} | Requst Params:`);
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
  gbif: the result from GBIF Org API
  valDR: the result from VAL dataResource api for one GBIF dataSet GUID
  valDP: the result from VAL dataProvider api for one GBIF dataProvider GUID

NOTE: we may need to append DRs in valDR to DRs in valDP.
*/

function GbifToValDataProvider(gbifOrg, valDR={}, valDP={}, gbifIpt=[]) {
  // Don't change all nulls to empty strings (""). Some fields require null or non-empty string.
  //var valDP = {
    valDP.name = gbifOrg.title; //"Vermont Center for Ecostudies",
    valDP.acronym = "";//"VCE",
    //"uid = "dp0";
    valDP.guid = gbifOrg.key;
    valDP.address = gbifOrg.address[0] + gbifOrg.city + gbifOrg.province + gbifOrg.postalCode + gbifOrg.country;
    valDP.phone = gbifOrg.phone;
    valDP.email = gbifOrg.email;
    valDP.pubShortDescription = null;
    valDP.pubDescription = gbifOrg.description;
    valDP.techDescription = null;
    valDP.focus = null;
    valDP.state = gbifOrg.province;
    if (gbifIpt.length > 0) {
      valDP.websiteUrl = gbifIpt.url.endpoints[0].url; //"http://ipt.vtecostudies.org";
    }
    //valDP.alaPublicUrl = "https://collectory.vtatlasoflife.org/public/show/dp0";
    valDP.networkMembership = null;
    valDP.attributions = [];
    //"dateCreated = "2019-10-07T15:01:53Z";
    //"lastUpdated = "2019-10-07T17:34:42Z";
    //"userLastModified = "jloomis@vtecostudies.org";
    /*
    "dataResources = [
      {
        "name":"Records of Hawk Moths (Sphingidae) from Vermont, USA",
        "uri":"https://collectory.vtatlasoflife.org/ws/dataResource/dr410",
        "uid":"dr410"//,
        //"id":430
      }
    ],
    */
    const newDR = {
      "name":valDR.name,
      "uri":valDR.uri,
      "uid":valDR.uid
      };

    if (valDP.dataResources) {
      valDP.dataResources.push(newDR);
    } else {
      valDP.dataResources = newDR;
    }

    valDP.gbifRegistryKey = gbifOrg.key;

  return valDP;
}
