/*
  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.
  Subsequent to that success, manage the downstream implications of that.

  File: 08_api_delete_resources_by_UID.js

  Specifics:
  - Delete a list of Data Resources that are no longer valid in VAL DE.

  Notes:
*/

const fs = require('fs');
const paths = require('./00_config').paths;
const urls =  require('./00_config').urls;
const Request = require('request');
const moment = require('moment');
const log = require('./VAL_Utilities/97_utilities').log;
const logDir = '../split-logs/';
const logFile = 'delete_resources_by_UID_' + moment().format('YYYYMMDD-hhmmssS') + '.txt';
const logStream = fs.createWriteStream(`${logDir}${logFile}`, {flags: 'w'});

log(`config paths: ${JSON.stringify(paths)}`, logStream, true);

var UIDs = [];
UIDs = [
'dr289', 'dr213', 'dr237', 'dr53', 'dr167', 'dr107', 'dr280', 'dr126',
'dr220', 'dr138', 'dr196', 'dr137', 'dr329', 'dr256','dr64', 'dr316',
'dr52', 'dr125', 'dr54', 'dr326', 'dr340', 'dr97', 'dr315'];

UIDs.forEach(uid => {
  var parms = {url: `${urls.collectory}/ws/dataResource/${uid}`};//DELETE operates on uid, not guid

  Request.delete(parms, (err, res, body) => {
      if (err || res.statusCode > 399) {
        log(`DELETE Data Resource UID ${uid} ERROR | ${res.statusCode} | ${res.statusMessage}`, logStream, true);
        //console.dir(res);
        return err;
      } else {
        log(`DELETE Data Resource UID ${uid} SUCCESS | ${res.statusCode} | ${res.statusMessage}`, logStream, true);
        return res;
      }
    });
})
