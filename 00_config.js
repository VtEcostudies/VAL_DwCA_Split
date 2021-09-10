/*
VAL DE GBIF Occurrence-Data Harvesting Process Roadmap:

1) Download latest DwCA zip for all of Vermont from GBIF. The query params for this dataset have changed over time.
  As of 07-07-2020, the GBIF dataset query is:
  - https://www.gbif.org/occurrence/search?geometry=POLYGON((-73.38789%2045.02072,-73.41743%2044.62239,-73.32404%2044.47363,-73.47236%2044.0606,-73.39689%2043.77059,-73.47379%2043.57988,-73.39689%2043.54406,-73.33646%2043.60972,-73.29252%2043.56197,-73.29252%2042.73641,-72.52897%2042.73238,-72.44108%2042.99409,-72.28178%2043.65346,-72.0593%2043.8992,-72.01536%2044.21698,-71.51548%2044.48409,-71.47627%2045.01296,-73.38789%2045.02072))&has_coordinate=true&has_geospatial_issue=false
  As of 2021-01-28, the GBIF dataset query is:
  - https://www.gbif.org/occurrence/search?advanced=1&gadm_gid=USA.46_1
  GADM query didn't work - boundaries were inaccurate.
  As of 2021-09-08, the GBIF dataset queries are:
  - https://www.gbif.org/occurrence/search?geometry=POLYGON((-73.38789%2045.02072,-73.48975%2044.62605,-73.4425%2044.44829,-73.48096%2044.05463,-73.39689%2043.77059,-73.47379%2043.57988,-73.39689%2043.54406,-73.33646%2043.60972,-73.29252%2043.56197,-73.29252%2042.73641,-72.52897%2042.73238,-72.44108%2042.99409,-72.28178%2043.65346,-72.0593%2043.8992,-72.01536%2044.21698,-71.51548%2044.48409,-71.47627%2045.01296,-73.03107%2045.02792,-73.03711%2045.14292,-73.30463%2045.14466,-73.38789%2045.02072))&has_geospatial_issue=false
  - https://www.gbif.org/occurrence/search?has_coordinate=false&state_province=Vermont&state_province=Vermont%20(State)&state_province=VErmont&state_province=Vermont%20State%20(%E4%BD%9B%E8%92%99%E7%89%B9%E5%B7%9E)&state_province=Vermont%20%3F&state_province=Vermont%20(%E4%BD%9B%E8%92%99%E7%89%B9%E5%B7%9E)&advanced=1
2) Extract to the folder C:\Users\jloomis\Documents\VCE\VAL_DWcA_Split\dwca_gbif_2021-09-07
3) Alter the config settings in this config file, below, under exports.paths like eg.
  - dwcaDir: "../dwca_gbif_2020-07-07",
  - splitDir: "../split_2020-07-07"
3.1) Pre-process the 'buffered' GBIF occurrence download to filter it against VCE's newer, more accurate spatial filter.

4) From a command-prompt in the directory C:\Users\jloomis\Documents\VCE\VAL_DWcA_Split\repo run the command:
  - node 01_occurrence_split.js
  - see the documentation within 01_occurrence_split.js for behavior
  - For debugging, you can set a flag to push output to the console. This is VERY slow.
  - A better option is to use ${sDir}/occurrence_split.log
  - Errors are not pushed to file. Any errors will appear on the console.
5) When (4) completes run the command:
  - node 02_verbatim_split.js
  - debugging and error reporting are the same as (4) above.
6) When (5) completes, run the command:
  - node 03_citations_rights_get.js
  - logging goes to {splitDir}\citations_rights_get.log
  - errors go to {splitDir}\citations_rights_get.err
7) Due to very poor performance handling image files, handle multimedia files in a 2-stage process:
  - node 04_multimedia_init.js (MUST run to have a blank file to match meta.xml)
  - proceed to the next steps to load all occurrences without multimedia extensions.
  - After all occurrences are loaded/processed/sampled/indexed, load images another way.
  - node 11_multimedia_split.js
  - This is necessary because DwCA files to be shipped to the VAL server have a reference to a multimedia.txt in meta.xml.
    Rather than alter every meta.xml, it's far easier (and flexible, allowing us to add them later) to just ship an empty
    multimedia.txt. VAL DE (ALA) handles this just fine.
8) When (7) completes, run the command:
  - node 05_zip_dwca.js
  - There was an attempt at uploading mutlimedia_only via prompt which doesn't work and is disabled.
  - You will be prompted to zip Multimedia Datasets Only...oops, it doesn't work. (Commented the code.)
  - Some files are enormous. On zipping large files, it will appear as if the process has hung. You may need to wait 30
    minutes, or more.
9) If you haven't already, verify there's a recent AWS snapshot backup of the VAL DE Live server:
  - Go to AWS Console: https://us-west-2.console.aws.amazon.com/ec2/v2/home?region=us-west-2#Snapshots:sort=tag:Name
  - Look for a recent weekly backup, which should be named 'vol_ala-auto_core', and is done weekly on Fridays via a lifecycle policy found here:
  - https://us-west-2.console.aws.amazon.com/ec2/v2/home?region=us-west-2#Lifecycle:sort=PolicyId
10) If you haven't already, update the VAL Vermont Registry of Names. The next steps will upload and ingest occurrences.
    This is a time-consuming process. You should only need to ingest occurrences once per time-period, but you will need
    the latest names to do that.
  - See the process for updating the VAL Vermont Registry of Names here: https://github.com/VtEcostudies/val_species
11) Prepare and upload zipped DwCA files to gbif-split directory on VAL Core server:
  - cd /srv/
  - Rename existing gbif-split to gbif-split_{original-date}
  - Create a new gbif-split directory on the ALA Core Server (/srv/vtatlasoflife.org/www/gbif-split)
  - local machine: cd C:\Users\jloomis\Documents\VCE\VAL_Data_Pipelines\VAL_DWcA_Split\split_2021-05-05
  - scp -i "C:/Users/jloomis/.ssh/vce_live_aws_key_pair.pem" ./*.zip ubuntu@52.10.66.189:/srv/vtatlasoflife.org/www/gbif-split
  - chmod -R 777 /srv/vtatlasoflife.org/www/gbif-split
  - chown -R tomcat7.tomcat7 /srv/vtatlasoflife.org/www/gbif-split
  - IMPORTANT: MOVE 2 LARGEST FILES TO SUB-DIR BEFORE PROCESSING
    - mkdir skip-huge
    - mv 4fa7b334-ce0d-4e88-aaae-2e0c138d049e.zip ./skip-huge (eBird)
    - mv 50c9509d-22c7-4a22-a47d-8c48425ef4a7.zip ./skip-huge (iNat)
  - Load/reload all others first, then move those two files back and load/reload them individually (see below)
12) When (8) completes and (9) thru (11) are done, run the command below.
  - This will create/update all Data Resources in VAL in preparation for data ingestion.
  - NOTE: This now also creates/updates all dataProviders as well
  - node 06_api_create_update_data_resources.js
13) When (12) completes, run the command below.
  - This will create/update all Data Providers in VAL in preparation for data ingestion.
  - NOTE: This is no longer necessary because 06_... above now does it
  - node 07_api_create_data_providers.js
14) Proceed with ingestion of all data on the VAL DE server. This is an ALA process with its own
    detailed steps, outlined here:
  - cd /data/biocache
  - ls -alh
  - rm *.out
  - ./load-all.sh && tail -f load_all.out
  - mv /srv/vtatlasoflife.org/www/gbif-split/skip-huge/* /srv/vtatlasoflife.org/www/gbif-split
  - ./load-dr19.sh && tail -f load_dr19.out
  - ./load-dr1.sh && tail -f load_dr1.out
  - ./process-all.sh && tail -f process_all.out
  - ./before_index.sh
  - ./index-all.sh && tail -f index_all.out
  - Read the contents of after_index.sh make changes accordingly, and execute it
15) You may find that some historically-involved Data Resources no longer have data in Vermont. This should only happen
    with the correction of the GIS bounding-box used in the GBIF download query. It did happen on 2021-02-15 with the change
    to our GADM query. We found 23 datasets that are no longer valid:
  - See 08_api_delete_resources_by_UID.js to handle those.
*/

exports.paths = {
  test_dwcaDir: "../dwca-small",
  test_splitDir: "../split-small",
  dwcaDir: "../dwca_gbif_occurrences_w_location",
  splitDir: "../split_w_location",
  logDir: "../split_logs",
  errDir: "../error_logs"
};

exports.urls = {
  primary:  "https://vtatlasoflife.org",
  collectory: "https://collectory.vtatlasoflife.org"
};
