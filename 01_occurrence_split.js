/*
  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: 01_occurrence_split.js

  Notes:
    dataset/provider eml is stored as /dataset/datasetKey.xml and referenced in
    occurrence.txt in the field named datasetKey.

  Specifics:
  - Create the splitDir directory (synchronously!)
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
  - Also create a new array/object, collObj and instObj
*/

//https://nodejs.org/api/readline.html
const readline = require('readline');
const fs = require('fs');
const constants = require('constants');
const log = require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;
const csvLineToObject = require('./VAL_Utilities/99_parse_csv_to_array').csvLineToObject;

const paths = require('./00_config').paths;
const dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
const sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files
const occF = 'occurrence.txt';
const logDir = paths.logDir; //sDir;
const errDir = sDir; //put errors in splitDir to use as future data inputs
const logName = 'occurrence_split';
const errName = 'occurrence_error';

const MODE = 'w'; //'a'; // open some files to append on a 2nd pass to add data. otherwise, open to write.

var wStream = []; //array of write streams, one for each datasetKey plus dKeyGbifArr, collections, institutions
var gbifArr = []; //array of gbifIds. value is single datasetKey, gbifArr[gbifId] = dKey
var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds, dkeyArr[dKey] = [gbifId,gbifId,...]
var collObj = {}; //object as array of datasetKeys. value is array of Collection Codes, collObj[dKey] = [cCode,cCode,...]
var instObj = {}; //object as array of datasetKeys. value is array of Institution Codes, instObj[dKey] = [iCode,iCode,...]

var idx = 0; //file row index
var ctD = 0; //dataset count
var ctC = 0; //collectionCode count
var ctI = 0; //institutionCode count
var dlm = "\t"; //input file delimiter
var top = ""; //1st line in file - header row with field names
var logToConsole = false; //console logging slows processing a lot

const guid = /^[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12}$/i; // validate 8-4-4-4-12

var copyFile = [];

process.on('exit', function(code) {
  return log(1,`Exiting with code ${code}.`, 'Occurrence Records', idx, 'Datasets', ctD, 'Collections', ctC, 'Institutions', ctI);
});

init(logName, logDir) //init's error does not throw error, allowing this to proceed on error
  .then((logStream) => {

    try {
      fs.mkdirSync(sDir, {recursive: true}); //make the splitDir
    }
    catch (err) {
      log(1, `ERROR | fs.mkdirSync(${sDir})`, err);
    }

    log(1, `config paths: ${JSON.stringify(paths)}`);

    wStream['gbifArr'] = fs.createWriteStream(`${sDir}/gbifId_datasetKey.txt`, {flags:MODE});

    var fRead = readline.createInterface({
      input: fs.createReadStream(`${dDir}/${occF}`)
    });

    //read occurrence.txt
    fRead.on('line', function (row) {
      var gbifId = 0;
      var dKey = "";
      var ret = {};

      var prs = {}; //row parsed object having row (object) and rowA (array) elements
      var obj = {}; //row converted to JSON object
      var arr = []; //row converted to array
      var txt = ""; //row parsed and cleaned - for insert into output file
      var mod = null; //array copied by value

      if (idx == 0) {
        top = row; //save the 1st row for each dKey/occurrence.txt
      } else {
        prs = csvLineToObject(dlm, top, row, false);
        obj = prs.rowO;
        arr = prs.rowA;
        txt = prs.rowT;
        gbifId = obj.gbifID;
        dKey = obj.datasetKey;

        //NEW: check if dKey is defined and a GUID - getting errors where dKey is undefined or a numeric, like 4309
        if (dKey && dKey.match(guid)) {

          //make gbifArr[gbifId] = dKey
          gbifArr[gbifId] = dKey;
          //look for already-open gbifArr write stream. if not, create it. we do NOT wait for it to open?
          if (!wStream['gbifArr']) {
            wStream['gbifArr'] = fs.createWriteStream(`${sDir}/gbifId_datasetKey.txt`, {flags:MODE});
            wStream['gbifArr'].write(`${gbifId}:${dKey}\n`);
          } else {
            //immediately write to file (assumed unique)
            wStream['gbifArr'].write(`${gbifId}:${dKey}\n`);
          }
          log(0, idx, gbifId, dKey);

          //create dKey and dKey/data directories (in one go) if they don't exist
          //fs.mkdir(`${sDir}/${dKey}/dataset`, {recursive:true}, (err) => {
          //if (err) throw err;
          //NOTE: Couldn't make async mkdir work, even though I call copyfile inside
          //callback, and there were no errors. Seems ridiculous to have to write a
          //custom waitfor method to handle file system async uncertainty.

          try {
            fs.mkdirSync(`${sDir}/${dKey}/dataset`, {recursive:true}); //NOTE: this fails on values in "double-quotes"
            try {
              eachRow(sDir, gbifId, dKey, top, txt, obj);
            } catch (err) {
              //log(1, `ERROR | eachRow`, err);
            }
          } catch (err) {
            log(1, `ERROR | fs.mkdirSync(${sDir}/${dKey}/dataset)`, err);
          }
        } else { //end if (dKey.match(guid)) - didn't match, so we had a row-parsing error
          log(1, 'ERROR|', idx, '|gbifId:', gbifId, '|datasetKey:', dKey);
          if (!wStream['error']) {
            wStream['error'] = fs.createWriteStream(`${errDir}/${errName}.txt`);
            wStream['error'].write(`${top}\n`);
          }
          wStream['error'].write(`${row}\n`);
          var quotes = (row.match(/"/g) || []).length;
          log(1, `quote count:${quotes}\n`);
          wStream['error'].write(`quote count:${quotes}\n`);
        }
      } //end if (idx==0)
      idx++;
    }); //end fread.on('line')

    /* when occurrence.txt is done, put local arrays to file:
      dKeyArr[dKey]
      collObj[collId][dKey]
      instObj[instId][dKey]

      Note that gbifArr[gbifId] = dKey is put to file on the fly.
    */
    fRead.on('close', function() {
      try {
        //look for already-open dKeyArr write stream
        if (!wStream['dKeyGbifArr']) {
          wStream['dKeyGbifArr'] = fs.createWriteStream(`${sDir}/datasetKey_gbifArray.txt`, {flags:MODE});
        }
        //put dKeyArr to file
        Object.keys(dKeyArr).forEach(function(key) {
          //log(1, `${key}:${dKeyArr[key]}\n`);
          wStream['dKeyGbifArr'].write(`${key}:${dKeyArr[key]}\n`);
        });

        //look for already-open collObj write stream
        if (!wStream['dKeyCollObj']) {
          wStream['dKeyCollObj'] = fs.createWriteStream(`${sDir}/CollectionCodes_datasetKeys.txt`, {flags:MODE});
        }
        //put collObj to file
        Object.keys(collObj).forEach(function(coll) {
          //log(1, `${coll}:${collObj[coll]}\n`);
          keys = '';
          Object.keys(collObj[coll]).forEach(function(key) {
            if (keys) {keys += '|';} keys += key; //can't delimit with ',' collections often contain these
          });
          wStream['dKeyCollObj'].write(`${coll}:${keys}\n`);
        });

        //look for already-open instObj write stream
        if (!wStream['dKeyInstObj']) {
          wStream['dKeyInstObj'] = fs.createWriteStream(`${sDir}/InstitutionCodes_datasetKeys.txt`, {flags:MODE});
        }
        //put instObj to file
        Object.keys(instObj).forEach(function(inst) {
          //log(1, `${inst}:${instObj[inst]}\n`);
          keys = '';
          Object.keys(instObj[inst]).forEach(function(key) {
            if (keys) {keys += '|';} keys += key; //can't delimit with ',' institutions often contain these
          });
          wStream['dKeyInstObj'].write(`${inst}:${keys}\n`);
        });

      } catch(err) {
        throw(err);
      }
    });
});

function eachRow(sDir, gbifId, dKey, top, row, obj) {

  if (obj.collectionCode) {
    if (!collObj[obj.collectionCode]) {
      ctC++;
      collObj[obj.collectionCode]={};
    }
    collObj[obj.collectionCode][dKey]=1; //hm. we can set a sub-object this way. surprising.
  }

  if (obj.institutionCode) {
    if (!instObj[obj.institutionCode]) {
      ctI++;
      instObj[obj.institutionCode]={};
    }
    instObj[obj.institutionCode][dKey]=1; //hm. we can set a sub-object this way. surprising.
  }

  //Only copy/overwrite files once per datasetKey. use dKeyArr as checklist.
  if (!dKeyArr[dKey]) {
    ctD++; //a global variable
    // make dKeyArr[dKey] = [gbifId, gbifId, ...]
    dKeyArr[dKey]=[];
    dKeyArr[dKey].push(gbifId);

    if ('w' == MODE) { //write mode - just write the files
      fs.copyFile(`${dDir}/dataset/${dKey}.xml`, `${sDir}/${dKey}/dataset/${dKey}.xml`, (err) => {
        if (err) {log(1, `ERROR`, `Copying ${dDir}/${dKey}.xml ==> ${sDir}/${dKey}/${dKey}.xml`);}
        else {log(1, `Copied ${dDir}/dataset/${dKey}.xml ==> ${sDir}/${dKey}/dataset/${dKey}.xml`);}
      });
      fs.copyFile(`${dDir}/meta.xml`, `${sDir}/${dKey}/meta.xml`, (err) => {
        if (err) {log(1, `ERROR`, `Copying ${dDir}/meta.xml ==> ${sDir}/${dKey}/meta.xml`);}
        else {log(1, `Copied ${dDir}/meta.xml ==> ${sDir}/${dKey}/meta.xml`);}
      });
      fs.copyFile(`${dDir}/metadata.xml`, `${sDir}/${dKey}/metadata.xml`, (err) => {
        if (err) {log(1, `ERROR`, `Copying ${dDir}/metadata.xml ==> ${sDir}/${dKey}/metadata.xml`);}
        else {log(1, `Copied ${dDir}/metadata.xml ==> ${sDir}/${dKey}/metadata.xml`);}
      });
    } else { //append mode - if files don't exist, write them. If they DO, ...
      copyFile = [`dataset/${dKey}.xml`,'meta.xml','metadata.xml'];
      for (i=0; i<3; i++) {
        log(1, `checking for existence of ${copyFile[i]}...`);
        fs.access(`${sDir}/${dKey}/${copyFile[i]}`, constants.F_OK, (a_err, i) => {
          if (a_err) { //copyFile doesn't exist
            log(1, `${sDir}/${dKey}/${copyFile[i]} DOESN'T EXIST`);
            fs.copyFile(`${dDir}/${copyFile[i]}`, `${sDir}/${dKey}/${copyFile[i]}`, (err) => {
              if (err) {log(1, `ERROR`, `Copying MISSING file ${dDir}/${copyFile[i]} ==> ${sDir}/${dKey}/${copyFile[i]}`);}
              else {log(1, `Copied ${dDir}/${copyFile[i]} ==> ${sDir}/${dKey}/${copyFile[i]}`);}
            });
          } else { //file exists. just copy metadata.xml to metadata.N.xml
            log(1, `${sDir}/${dKey}/${copyFile[i]} EXISTS!!`);
            if ('metadata.xml' == copyFile[i]) {
              done = 0;
              for (j=1; j<10; j++) {
                if (done) break;
                fs.copyFile(`${dDir}/metadata.xml`, `${sDir}/${dKey}/metadata.${j}.xml`, constants.COPYFILE_EXCL, (err, i, j) => {
                  if (err) {log(1, `ERROR`, `Copying SIMILAR file ${dDir}/${copyFile[i]} ==> ${sDir}/${dKey}/metadata.${j}.xml`);}
                  else {log(1, `Copied ${dDir}/${copyFile[i]} ==> ${sDir}/${dKey}/metadata.${j}.xml`); done=1;}
                });
              }
            }
          }
        });
      }
    }
  } else {
    // make dKeyArr[dKey] = [gbifId, gbifId, ...]
    dKeyArr[dKey].push(gbifId);
  }

  //look for already-open dKey/occurrence.txt write stream. create if not.
  if (!wStream[dKey]) {
    wStream[dKey] = fs.createWriteStream(`${sDir}/${dKey}/occurrence.txt`, {flags:MODE});
    if ('w' == MODE) { //write header row in write mode, NOT append mode
      wStream[dKey].write(`${top}\n`);
    }
    wStream[dKey].write(`${row}\n`);
  } else {
    //write occurrence row to datasetKey/occurrence.txt
    wStream[dKey].write(`${row}\n`);
  }
}
