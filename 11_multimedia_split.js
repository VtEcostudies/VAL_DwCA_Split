/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: multimedia_split.js

  Specifics:
  Split multimedia.txt into datasetKey directories using gbifId-to-datesetKey
  array-in-file generated from processing occurrence.txt, which contains the
  only link between gbifId and datasetKey.

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in multimedia.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;

console.log(`config paths: ${JSON.stringify(paths)}`);

var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wStream = []; //array of write streams, one for each datasetKey
var gbifArr = []; //array of gbifIds, value is datasetKey
var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifId = 0;
var dKey = "";
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/gbifId_datasetKey.txt`)
});

//load the gbifId-to-datasetKey file into local array
dRead.on('line', function (row) {
  idx++;
  arr = row.split(":");
  mod = arr.slice(); //using .slice() copies by value, not by reference

  gbifId = mod[0];
  dKey = mod[1];
  gbifArr[gbifId] = dKey;

  if (!dKey) {
    console.log(idx, gbifId, dKey);
  }
  //console.log(`${idx} Adding multimedia file for gbifId: ${gbifId} to datasetKey: ${dKey}`);
});

//when the gibfId-to-datasetKey file is done loading, process multimedia.txt
dRead.on('close', function() {
  top = "";
  idx = 0;
  var m_arr = [];
  var m_mod = null;
  var m_gbifId = 0;
  var m_dKey = "";
  var filtered = 0;

  var vRead = readline.createInterface({
    input: fs.createReadStream(`${dDir}/multimedia.txt`)
  });

  wStream['mm_dKeys'] = fs.createWriteStream(`${sDir}/multimedia_datasetKeys.txt`);

  vRead.on('line', function (m_row) {
      if (idx == 0) {
        top = m_row; //save the 1st row for each dKey/multimedia.txt
      } else {
        //<field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>
        //<field index="12" term="http://purl.org/dc/terms/publisher"/>
        m_arr = m_row.split("\t");
        m_mod = m_arr.slice(); //using .slice() copies by value, not by reference

        m_gbifId = m_mod[0];
        m_dKey = gbifArr[m_gbifId];

        //console.log(`${idx} | multimedia.txt | ${dKey} | ${gbifId}`);

        //look for already-open dKey write stream
        //if not, create stream/file, write header
        //also add dKey to multimedia_datasetKeys to limit processing to those files later (if desired)
        if (!m_dKey) {
          filtered++;
          console.log(`INDEX: ${idx} | COUNT: ${filtered} | gbifId: ${m_gbifId} from UNFILTERED multimedia.txt NOT IN filtered result set`);
        } else {
          if (!wStream[m_dKey]) {
            wStream[m_dKey] = fs.createWriteStream(`${sDir}/${m_dKey}/multimedia.txt`);
            wStream[m_dKey].write(`${top}\n`);
            console.log(`${idx} | create multimedia.txt | publisher: ${mod[12]} | ${m_dKey} | ${m_gbifId}`);
            wStream['mm_dKeys'].write(`${m_dKey}\n`);
          }
          wStream[m_dKey].write(`${m_row}\n`);
        }
      }
      idx++;
  });

  vRead.on('close', function() {
    console.log(`Done reading aggregate multimedia.txt`);
  });

});
