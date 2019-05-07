/*
  Author: Jason Loomis

  File: api_create_resources.js

  Purpose:
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a seprate data resource.

  Specifics:
  Create or Update VAL Collectory Resources from datasets.

  For each datasetKey, POST/PUT to the VAL API:

  http://beta.vtatlasoflife.org/collectory/ws/{resourceType}/{typeId}

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
  Object.keys(dKeyArr).forEach(function(dKey) {
    //request citation object from GBIF dataset API
    Request.get(`http://api.gbif.org/v1/dataset/${dKey}`, (err, res, body) => {
        if (err) {return console.log(err);}
        var gbif = JSON.parse(body);
        var pBody = gbifToAlaDataset(gbif);
        console.log(`${idx} | dataset | ${dKey}`);
        //console.dir(gbif);
        Request.get(`${urls.val}/collectory/ws/dataResource?guid=${dKey}`, (err, res, body) => { //find DR
          if (err) {return console.log(err);}
          console.log(dKey, res.statusCode);
          if (res.statusCode === 200) {
            var vBody = JSON.parse(body); //need the existing content for PUT
            console.dir(vBody);
            if (vBody.length === 1) { //PUT
              Request.put({
                url: `${urls.val}/collectory/ws/dataResource/${vBody[0].uid}`,
                body: pBody,
                json: true
              }, (err, res, body) => { //update DR
                if (err) {return console.dir(err);}
                console.dir(`PUT result: ${res.statusCode}`);
              });
            } else if (vBody.length === 0) { //POST
              Request.post({
                  url: `${urls.val}/collectory/ws/dataResource`,
                  body: pBody,
                  json: true
                }, (err, res, body) => { //create DR
                if (err) {return console.dir(err);}
                console.dir(`POST result: ${res.statusCode}`);
              });
            }
          } else { //ERROR
            console.log(`Error: ${res.statusCode}`);
          }
        });
        idx++;
    });
  });
});

function gbifToAlaDataset(gbif) {

  return {
      "name": gbif.title,
      "acronym": null,
      //"uid": gbif.key, //looks like we can't set this on creation (or PUT) so leave it off
      "guid": gbif.key,
      "address": null,
      "phone": null,
      "email": null,
      "pubShortDescription": null,
      "pubDescription": gbif.description,
      "techDescription": null,
      "focus": null,
      "state": null,
      "websiteUrl": gbif.homepage,
      //"alaPublicUrl": "http://beta.vtatlasoflife.org/collectory/public/show/dr8",
      "networkMembership": null,
      "hubMembership": [],
      "taxonomyCoverageHints": [],
      "attributions": [], //gbif.contacts,
      //"dateCreated": "2019-04-30T13:05:24Z",
      //"lastUpdated": "2019-05-02T15:42:44Z",
      //"userLastModified": "not available",
      "rights": gbif.license,
      "licenseType": "other",
      "licenseVersion": null,
      "citation": gbif.citation.text,
      "resourceType": "records",
      "dataGeneralizations": null,
      "informationWithheld": null,
      "permissionsDocument": null,
      "permissionsDocumentType": "Other",
      "contentTypes": [
          "point occurrence data",
          "gbif import"
      ],
      "connectionParameters": {
          "protocol": "DwCA",
          "url": `${urls.val}/collectory/upload/${gbif.key}.zip`,
          "termsForUniqueKey": [
              "gbifID"
          ]
      },
      "hasMappedCollections": false,
      "status": "identified",
      //"provenance": null,
      "harvestFrequency": 0,
      //"lastChecked": "2019-04-30T18:17:17Z",
      "dataCurrency": null,
      "harvestingNotes": null,
      "publicArchiveAvailable": false,
      "publicArchiveUrl": "",
      "gbifArchiveUrl": "",
      "downloadLimit": 0,
      "gbifDataset": true,
      "isShareableWithGBIF": true,
      "verified": false,
      "gbifRegistryKey": gbif.key,
      "doi": gbif.doi
  }
}
