/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: api_create_resources.js
  
  Specifics:
  - use config.js to gather local folder holding source data, remove url hosting collectory API
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
var paths = require('./config').paths;
var urls =  require('./config').urls;
var Request = require("request");

console.log(`config paths: ${JSON.stringify(paths)}`);

var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wsCitations = []; //array of write streams, one for each datasetKey
var wsRights = []; //array of write streams, rights.txt
var gbifArr = []; //array of gbifIds, value is datasetKey
var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifObj = {};
var gbifId = 0;
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
    Request.get(`http://api.gbif.org/v1/dataset/${dKey}`, (err, res, body) => {
        if (err) {return console.log(err);}
        var gbif = JSON.parse(body);
        var pBody = gbifToAlaDataset(gbif);
        console.log(`${idx} | dataset | ${dKey}`);
        //console.dir(gbif);
        //search request for dataResource object from ALA collectory API
        Request.get(`${urls.collectory}/ws/dataResource?guid=${dKey}`, (err, res, body) => { //find DR
          if (err) {return console.log(err);}
          console.log(dKey, res.statusCode);
          if (res.statusCode === 200) {
            var vBody = JSON.parse(body); //need the existing content for PUT
            console.dir(vBody);
            console.log(`PUT/POST Body:`);
            console.dir(pBody);
            if (vBody.length === 1) { //PUT
              //dataResource with guid==datasetKey found: PUT
              Request.put({
                url: `${urls.collectory}/ws/dataResource/${vBody[0].uid}`,
                body: pBody,
                json: true
              }, (err, res, body) => { //update DR
                if (err) {return console.dir(`PUT ERROR: ${err} | ${vBody[0].uid} | ${dKey}`);}
                return console.dir(`PUT result: ${res.statusCode}`);
              });
            } else if (vBody.length === 0) { //POST
              //dataResource with guid==datasetKey NOT found: POST
              Request.post({
                  url: `${urls.collectory}/ws/dataResource`,
                  body: pBody,
                  json: true
                }, (err, res, body) => { //create DR
                  if (err) {return console.dir(`PUT ERROR: ${err} | ${vBody[0].uid} | ${dKey}`);}
                return console.dir(`POST result: ${res.statusCode}`);
              });
            } else { //vbody.length > 1
              //dataResource with guid==datasetKey found more than one: ERROR
              return console.log(`Error: Invalid record count: ${vBody.length}`);
            }
          } else { //ERROR
            //
            return console.log(`Error: ${res.statusCode}`);
          }
        });
        idx++;
    });
  });
});

function gbifToAlaDataset(gbif, put = true) {
  // Don't change all nulls to empty strings (""). Some fields require null or non-empty string.
  var ala = {
      "name": `${gbif.title} (Vermont)`,
      "acronym": "",
      "uid": gbif.key, //this field cannot be set externally
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
      //"dateCreated": "2019-04-30T13:05:24Z",
      //"lastUpdated": "2019-05-02T15:42:44Z",
      //"userLastModified": "not available",
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
      //"lastChecked": "2019-04-30T18:17:17Z",
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
