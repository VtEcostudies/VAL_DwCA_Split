/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: citations_rights_get.js

  Specifics:
  Create citations.txt and rights.txt for each datasetKey in a subdirectory with
  that name using the datasetKey array datesetKey_gbifArray array-in-file
  generated from processing occurrence.txt, which contains the only link
  between gbifId and datasetKey.

  For each datasetKey, query the GBIF API http://api.gbif.org/v1/dataset/datasetKey
  to retrieve citations and rights information for the dataset.

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

  console.log(`${idx} datasetKey: ${dKey}`);
});

//when the datasetKey-to-gibfId file is done loading, create a new citations.txt
dRead.on('close', function() {
  idx = 1;
  Object.keys(dKeyArr).forEach(function(dKey) {
    //request citation object from GBIF dataset API
    Request.get(`http://api.gbif.org/v1/dataset/${dKey}`, (err, res, body) => {
        if (err) {
            return console.dir(err);
        }
        var jBod = JSON.parse(body);
        console.log(`${idx} | citation | ${jBod.citation.text}`);
        //open a write stream (create the file)
        wsCitations[dKey] = fs.createWriteStream(`${sDir}/${dKey}/citations.txt`);
        wsCitations[dKey].write("When using this dataset please use the following citation and pay attention to the rights documented in the rights.txt:\n");
        wsCitations[dKey].write(`${jBod.citation.text}\n`);

        console.log(`${idx} | rights | title | ${jBod.title}`);
        console.log(`${idx} | rights | license | ${jBod.license}`);
        console.log(`\n`);
        wsRights[dKey] = fs.createWriteStream(`${sDir}/${dKey}/rights.txt`);
        wsRights[dKey].write(`${jBod.title}\n`);
        wsRights[dKey].write(`${jBod.license}\n`);
        idx++;
    });
  });
});
