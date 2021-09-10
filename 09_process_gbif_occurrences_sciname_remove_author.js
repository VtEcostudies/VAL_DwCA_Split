/*
  Author: Jason Loomis

  Project: VAL_GBIF_Split

  File: 09_process_gbif_occurrences_sciname_remove_author.js

  Purpose:
  Process GBIF occurrence download for ingesting into the VAL DE (ALA) system.

  Specifics:

  On 2021-06-08, Spencer showed that, of 122 GBIF records for the species 'Agapostemon sericeus',
  VAL DE shows only 3. On investigation, we find that only one dataset was successfully indexed
  out of 3+. A comparison of the properly-indexed dataset with the non-indexed datasets suggests
  that the problem may be how scientificName is used in occurrence.txt, specifically that when
  Author is included, it does not work.

  To test this, we will process a dataset showing Author in scientificName to remove Author, then
  re-ingest that dataset to see if that resolves the issue.

  find the VAL ALA DR for GBIF dataSet Key
    https://collectory.vtatlasoflife.org/ws/dataResource?guid=d156cb49-ba5d-45fc-898e-3de6002d2efd
  view the VAL ALA DR
    https://biocache.vtatlasoflife.org/occurrences/search?q=data_resource_uid:dr400
  select a record that looks promising
    https://biocache.vtatlasoflife.org/occurrences/28f8cad9-45fb-4086-8651-4ba2f1b3f6f4
*/

const fs = require('fs');
const readline = require('readline');
const Request = require('request');
const moment = require('moment');
const paths = require('./00_config').paths;
const csvFileLineByLine = require('./VAL_Utilities/99_parse_csv_to_array').csvFileLineByLine;
const parseCanonicalName = require('./VAL_Utilities/97_utilities').parseCanonicalName;

const log = require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;

const logDir = paths.logDir
const logName = 'canonical_name_from_sciname';

const inpFileDelim = "\t";
const outFileDelim = "\t";

const test = 1; //flag a test-run

const dwcaDir = paths.dwcaDir + "/"; //path to directory holding source data files
var inpFileBase = 'occurrence'; //the base file to parse
if (test) {inpFileBase = 'test';}
const inpFileExtn = 'txt';
const inpFileName = `${inpFileBase}.${inpFileExtn}`;

var headRow = true;
var rowCount = 0; //count records available
var outCount = 0; //count records completed so far
var errCount = 0; //count record errors

//Don't create outStream here. An empty outStream var flags the writing header to file below.
var outFileName = `${inpFileBase}_canonical.${inpFileExtn}`;
var outStream = null;

process.on('exit', function(code) {
  displayStats();
  return console.log(`About to exit with code ${code}`);
});

/*
  Now we wait for the log init's createWriteStream to emit an 'open' or 'error' event before we begin.
*/
init(logName, logDir) //init's error does not throw error, allowing this to proceed on error
  .then((logStream) => {
    log('config paths', paths);
    try {
      /*
        To process occurrence.txt which is very large and exceeds memory capacity and throws an error,
        now we process the file line-by-line by passing a callback function with arguments received
        here. See '99_parse_csv_to_array.csvFileLineByLine'.
      */
      getOccFile(`${dwcaDir}${inpFileName}`, (src, idx) => {
        if (0 == idx) {
          log(`Input file Header`, src);
        } else {
          var sciName = src.scientificName;
          var taxRank = src.taxonRank;
          var parsed = parseCanonicalName(src, null, !test); //parse scientificName into canonicalName and scientificNameAuthorship
          var canName = parsed.canonicalName;
          var sciAuth = parsed.scientificNameAuthorship;
          if (canName != sciName) {
            src.scientificName = canName; //<<<==== SET scientifiName to our canonicalName!!!
            if (test || 0 == idx % 10000) {
              log(idx, sciName, canName, taxRank);
            }
          }
          /*
            IMPORTANT NOTE: YOU MUST ADD A LINE TO meta.xml <core> WHICH ACCOMPANIES occurrence.txt
            at the end of the field list like this:

            <field index="250" term="http://rs.tdwg.org/dwc/terms/scientificNameAuthorship"/>

          */
          if (!src.scientificNameAuthorship) {
            src.scientificNameAuthorship = sciAuth;
          }
          writeObjectToDelimitedFlatFile(src, outFileDelim);
        }
      });
    } catch(err) {
        log(`getOccFile ERROR`, err);
    }
});

/*
Parse the input occurrence.txt file line-by-line as an object for processing.
*/
async function getOccFile(inpFileSpec, callBack) {
  try {
    return await csvFileLineByLine(inpFileSpec, inpFileDelim, true, true, callBack);
  } catch(err) {
    throw(err);
  }
}

/*
get array of object keys from val object and write to file header
*/
function writeHeaderToFile(val) {
  var out = '';
  var arr = Object.keys(val); //result is array of keys

  for (i=0; i<arr.length; i++) {
    out += arr[i];
    if (i < (arr.length-1)) out += outFileDelim;
  }

  outStream.write(`${out}\n`);
}

/*
  This assumes that the incoming object is one line of data that was parsed into
  named fields that are DwCA compliant.
*/
function writeObjectToDelimitedFlatFile(val, delim=',') {
  var out = '';
  var fld = '';

  if (!outStream) {
    outStream = fs.createWriteStream(`${dwcaDir}${outFileName}`, {flags: 'w', encoding: 'utf8'});
    writeHeaderToFile(val);
  }

  //loop through values. add double quotes if not there
  for (const key in val) {
    //fld = val[key] || '';
    fld = val[key]!=null?val[key]:''; //this is not tested on a large set of data
    if (isNaN(fld)) { //check for null, numeric
      //check for leading and trailing double-quotes
      if (fld.substring(0,1) != `"` && fld.substring(fld.length-1,fld.length) != `"`) {
        fld = `"${fld}"`;
      }
    }
    out += fld + delim;
  }
  //write output to file
  out = out.replace(/(^,)|(,$)/g, "");//remove leading, trailing delimiter
  //log(`writeObjectToDelimitedFlatFile`, out);
  outStream.write(`${out}\n`);
  outCount++;
}

function displayStats() {
  log(`total:${rowCount}|output:${outCount}|errors:${errCount}`);
}
