/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: api_create_resources.js
  
  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gather from GBIF
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

  - Institutions
  - Collections (?)
  - dataProviders
  - dataResources

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in citation.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value we can use to create
    citation.txt (and others)
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;
var urls =  require('./00_config').urls;
var Request = require('request');

console.log(`config paths: ${JSON.stringify(paths)}`);

var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var dKey = "";
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`)
});

//load the datasetKey_gbifArray file into local array
dRead.on('line', function (row) {
  idx++;
  arr = row.split(":");
  mod = arr.slice(); //using .slice() copies by value, not by reference

  dKey = mod[0];
  dKeyArr[dKey] = mod[1];

  console.log(`read line: ${idx} datasetKey: ${dKey}`);
});

//when the datasetKey-to-gibfId file is done loading, create/update resources
dRead.on('close', function() {
  idx = 1;
  Object.keys(dKeyArr).forEach(function(dKey) { //Iterate over datasetKeys, using just the keys, here. Ignore gbifIds.
    //request dataset object from GBIF dataset API
    Request.get({url:`http://api.gbif.org/v1/dataset/${dKey}`, json:true}, (err, res, gbif) => {
        if (err) {console.log('GBIF GET Error', err, res.statusCode); return err;}
        var pBody = gbifToAlaDataset(gbif); //PUT/POST Body - create data format for LA Collectory from GBIF
        console.log(`${idx} | dataset | ${dKey}`);
        //search request for dataResource object from ALA collectory API
        Request.get({url:`${urls.collectory}/ws/dataResource?guid=${dKey}`, json:true}, (err, res, gBody) => { //find DR
          if (err) {console.log('Collectory GET Error', err, res.statusCode); return err;}
          console.log(dKey, res.statusCode);
          if (res.statusCode === 200) {
            if (gBody.length === 1) { //PUT (dataResource with guid==datasetKey found)
              Request.put({
                url: `${urls.collectory}/ws/dataResource/${gBody[0].uid}`, //PUT operates on uid, not guid
                body: pBody,
                json: true
              }, (err, res, body) => { //update DR
                if (err || res.statusCode > 399) {
                  console.log(`PUT Error for Data Resource UID ${gBody[0].uid}:`, res.statusCode, err);
                  return err;
                } else {
                  console.log(`PUT Result for Data Resource UID ${gBody[0].uid}:`, res.statusCode, `(${body})`);
                  return res;
                }
              });
            } else if (gBody.length === 0) { //POST (dataResource with guid==datasetKey NOT found)
              //delete pBody.uid; //remove uid from POST body
              Request.post({
                  url: `${urls.collectory}/ws/dataResource`, //POST operates on base path
                  body: pBody,
                  json: true
                }, (err, res, body) => { //create DR
                if (err || res.statusCode > 399) {
                  console.log(`POST Error GUID ${pBody.guid}:`, res.statusCode, res.statusCode, err);
                  return err;
                } else {
                  console.log(`POST Result GUID ${pBody.guid}:`, res.statusCode, `(${body})`);
                  return res;
                }
              });
            } else { //vbody.length > 1
              //dataResource with guid==datasetKey found more than one: ERROR
              return console.log(`Error: Invalid record count: ${gBody.length}`);
            }
          } else { //ERROR Getting the DR from the Collectory web service
            return console.log(`Collectory GET Error for ${urls.collectory}/ws/dataResource?guid=${dKey}: ${res.statusCode}`);
          }
        });
        idx++;
    });
  });
});

function gbifToAlaDataset(gbif) {
  // Don't change all nulls to empty strings (""). Some fields require null or non-empty string.
  var ala = {
      "name": `${gbif.title} (Vermont)`,
      "acronym": "",
      //"uid": `dr${idx}`, //gbif.uid || null, //DO NOT SEND THIS FIELD ON POST. This field cannot be set externally.
      "guid": gbif.key,
      "address": null, //can't be empty string
      "phone": "",
      "email": "",
      "pubShortDescription": "",
      "pubDescription": `${gbif.description} (Vermont)`,
      "techDescription": `https://www.gbif.org/occurrence/search?dataset_key=${gbif.key}&state_province=vermont&advanced=1`,
      "focus": "",
      "state": "",
      "websiteUrl": gbif.homepage,
      //"alaPublicUrl": "http://beta.vtatlasoflife.org/collectory/public/show/dr8",
      "networkMembership": null, //can't be empty string
      "hubMembership": [],
      "taxonomyCoverageHints": [],
      "attributions": [], //gbif.contacts,
      "rights": gbif.license,
      "licenseType": "",
      "licenseVersion": "",
      "citation": gbif.citation.text,
      "resourceType": "records",
      "dataGeneralizations": "",
      "informationWithheld": "",
      "permissionsDocument": "",
      "permissionsDocumentType": "Other",
      "contentTypes": [
          "point occurrence data",
          "gbif import"
      ],
      "connectionParameters": {
          "protocol": "DwCA",
          "url": `${urls.collectory}/gbif-split/${gbif.key}.zip`,
          "termsForUniqueKey": [
              "gbifID"
          ]
      },
      "hasMappedCollections": false,
      "status": "identified",
      "provenance": "", //can't be null. can be empty string.
      "harvestFrequency": 0,
      "dataCurrency": null, //can't be empty string
      "harvestingNotes": "",
      "publicArchiveAvailable": false,
      "publicArchiveUrl": "",
      "gbifArchiveUrl": "",
      "downloadLimit": 0,
      "gbifDataset": true,
      "isShareableWithGBIF": true,
      "verified": false,
      "gbifRegistryKey": gbif.key,
      "doi": gbif.doi //this does not work - cannot set via the API
  };

  return ala;
}
