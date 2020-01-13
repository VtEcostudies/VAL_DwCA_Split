/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: occurrence_split.js

  Notes:
    dataset/provider eml is stored as /dataset/datasetKey.xml and referenced in
    occurrence.txt in the field named datasetKey.

  Specifics:
  - Parse occurrence.txt by '\n' terminated line looking for datasetKey
  - Create a directory from each datasetKey with dataset sub-dir eg. datasetKey/dataset
  - Copy ./dataset/datasetKey.xml to ./datsetKey/dataset/datasetKey.xml
  - Copy ./meta.xml to ./datasetKey/meta.xml
  - Copy ./metadata.xml to ./datasetKey/metadata.xml
  - Create a new occurrence.txt in the ./datasetKey directory with just occurrences
    for that datasetKey
  - Create an array like gbifId=datasetKey and put into file gbifId_datasetKey.txt
  - After processing occurrence.txt, use that array-in-file to process
    verbatim.txt and multimedia.txt into their datasetKey directories.
  - Also create the inverse array, datasetKey=[gbifId,gbifId,...] and put into file
    called datasetKey_gbifArray.txt. The dKey checklist is used in citations_rights_get.
  - For each new datasetKey in occurrence.txt repeat the above steps
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;

log(`config paths: ${JSON.stringify(paths)}`);

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
var logToConsole = false; //console logging slows processing a lot

wStream['gbifArr'] = fs.createWriteStream(`${sDir}/gbifId_datasetKey.txt`);

var fRead = readline.createInterface({
  input: fs.createReadStream(`${dDir}/occurrence.txt`)
});

//read occurrence.txt
fRead.on('line', async function (row) {
    if (idx == 0) {
      top = row; //save the 1st row for each dKey/occurrenct.txt
    } else {
      //<field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>
      //<field index="206" term="http://rs.gbif.org/terms/1.0/datasetKey"/>
      arr = row.split("\t");
      mod = arr.slice(); //using .slice() copies by value, not by reference
      gbifId = mod[0];
      dKey = mod[206];

      //make gbifArr[gbifId] = dKey
      gbifArr[gbifId] = dKey;
      //look for already-open gbifArr write stream. if not, wait for it to open.
      if (!wStream['gbifArr']) {
        wStream['gbifArr'] = await fs.createWriteStream(`${sDir}/gbifId_datasetKey.txt`);
      }
      //immediately write to file (assumed unique)
      wStream['gbifArr'].write(`${gbifId}:${dKey}\n`);
      log(`${idx} | ${gbifId} | ${dKey}`);

      //create dKey and dKey/data directories (in one go) if they don't exist
      //fs.mkdir(`${sDir}/${dKey}/dataset`, {recursive:true}, (err) => {
      //if (err) throw err;
      //NOTE: Couldn't make async mkdir work, even though I call copyfile inside
      //callback, and there were no errors. Seems ridiculous to have to write a
      //custom waitfor method to handle file system async uncertainty.

      fs.mkdirSync(`${sDir}/${dKey}/dataset`, {recursive:true});

        //Only copy/overwrite files once per datasetKey. use dKeyArr as checklist.
        if (!dKeyArr[dKey]) {

          // make dKeyArr[dKey] = [gbifId, gbifId, ...]
          dKeyArr[dKey]=[];
          dKeyArr[dKey].push(gbifId);

          fs.copyFile(`${dDir}/dataset/${dKey}.xml`, `${sDir}/${dKey}/dataset/${dKey}.xml`, (err) => {
            if (err) throw err;
            log(`Copied ${dDir}/dataset/${dKey}.xml ==> ${sDir}/${dKey}/dataset/${dKey}.xml`, true);
          });
          fs.copyFile(`${dDir}/meta.xml`, `${sDir}/${dKey}/meta.xml`, (err) => {
            if (err) throw err;
            log(`Copied ${dDir}/meta.xml ==> ${sDir}/${dKey}/meta.xml`, true);
          });
          fs.copyFile(`${dDir}/metadata.xml`, `${sDir}/${dKey}/metadata.xml`, (err) => {
            if (err) throw err;
            log(`Copied ${dDir}/metadata.xml ==> ${sDir}/${dKey}/metadata.xml`, true);
          });
        } else {
          // make dKeyArr[dKey] = [gbifId, gbifId, ...]
          dKeyArr[dKey].push(gbifId);
        }

        //look for already-open dKey write stream. create if not.
        if (!wStream[dKey]) {
          wStream[dKey] = await fs.createWriteStream(`${sDir}/${dKey}/occurrence.txt`);
          wStream[dKey].write(`${top}\n`);
        }
        //write occurrence row to datasetKey/occurrence.txt
        wStream[dKey].write(`${row}\n`);

      //}); //end fs.mkdir
    }
    idx++;
});

//when occurrence.txt is done, put dKeyArr to file
fRead.on('close', async function() {
  //look for already-open dKeyArr write stream
  if (!wStream['dKeyGbifArr']) {
    wStream['dKeyGbifArr'] = await fs.createWriteStream(`${sDir}/datasetKey_gbifArray.txt`);
  }

  //put dKeyArr to file
  Object.keys(dKeyArr).forEach(function(key) {
    log(`${key}:${dKeyArr[key]}\n`);
    wStream['dKeyGbifArr'].write(`${key}:${dKeyArr[key]}\n`);
  });
});

async function log(txt, override=false) {
  try {
    if (logToConsole || override) {console.log(txt);}
    if (!wStream['log']) {
      wStream['log'] = await fs.createWriteStream(`${sDir}/occurrence_split.log`);
    }
    wStream['log'].write(txt + '\n');
  } catch(err) {
    throw err;
  }
}
