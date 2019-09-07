/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: api_delete_resources.js
  
  Specifics:
  - use config.js to define a local folder holding source data, remote url hosting collectory API
  - use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
  - call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
  - Delete all Data Resources found

  Notes:
  For each datasetKey, DELETE from the VAL API:

  val-docker (spring of 2019):
  http://beta.vtatlasoflife.org/collectory/ws/{resourceType}/{typeId}
  
  val-ansible-production (fall of 2019):
  https://collectory.vtatlasoflife.org/ws/{}/{}

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
var Request = require('request');

console.log(`config paths: ${JSON.stringify(paths)}`);

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var idx = 0; //file row index
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
      //search request for dataResource object from ALA collectory API
      Request.get(`${urls.collectory}/ws/dataResource?guid=${dKey}`, (err, res, body) => { //find DR
        if (err) {console.log(err, res); return err;}
        console.log(dKey, res.statusCode);
        if (res.statusCode === 200) {
          var gBody = JSON.parse(body); //GET Body from datasetKey lookup into LA Collectory - need the existing content for PUT
          if (gBody.length > 0) { //DELETE (dataResource with guid==datasetKey found)
            Request.delete({
              url: `${urls.collectory}/ws/dataResource/${gBody[0].uid}` //DELETE operates on uid, not guid
            }, (err, res, body) => { //update DR
              if (err || res.statusCode > 399) {
                console.log(`DELETE Error for Data Resource UID ${gBody[0].uid}:`, res.statusCode);
                return err;
              } else {
                console.log(`DELETE Result for Data Resource UID ${gBody[0].uid}:`, res.statusCode, `(${body})`);
                return res;
              }
            });
          } else {
            //dataResource with guid==datasetKey NOT found
            return console.log(`Error: record not found: ${gBody.length}`);
          }
        } else { //ERROR Getting the DR from the Collectory web service
          //
          return console.log(`Collectory GET Error for ${urls.collectory}/ws/dataResource?guid=${dKey}: ${res.statusCode}`);
        }
      });
      idx++;
  });
});
