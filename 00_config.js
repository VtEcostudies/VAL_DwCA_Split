
/*
VAL DE GBIF Occurrence-Data Harvesting Process Roadmap:

1) Download latest DwCA zip for all of Vermont from GBIF. The query params for this dataset have changed over time.
  As of 07-07-2020, the GBIF dataset query is:
  - https://www.gbif.org/occurrence/search?geometry=POLYGON((-73.38789%2045.02072,-73.41743%2044.62239,-73.32404%2044.47363,-73.47236%2044.0606,-73.39689%2043.77059,-73.47379%2043.57988,-73.39689%2043.54406,-73.33646%2043.60972,-73.29252%2043.56197,-73.29252%2042.73641,-72.52897%2042.73238,-72.44108%2042.99409,-72.28178%2043.65346,-72.0593%2043.8992,-72.01536%2044.21698,-71.51548%2044.48409,-71.47627%2045.01296,-73.38789%2045.02072))&has_coordinate=true&has_geospatial_issue=false
  As of 2021-01-28, the GBIF dataset query is:
  - https://www.gbif.org/occurrence/search?advanced=1&gadm_gid=USA.46_1
2) Extract to a folder like eg. C:\Users\jloomis\Documents\VCE\VAL_DWcA_Split\dwca_gbif_2020-07-07
3) Alter the config settings in this config file, below, under exports.paths like eg.
  - dwcaDir: "../dwca_gbif_2020-07-07",
  - splitDir: "../split_2020-07-07"
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
  - Rename existing gbif-split to gbif-split_{original-date}
  - Create a new gbif-split directory.
  - scp -i "C:/Users/jloomis/.ssh/vce_live_aws_key_pair.pem" ./*.zip ubuntu@52.10.66.189:/srv/vtatlasoflife.org/www/gbif-split
  - chmod -r 777 /srv/vtatlasoflife.org/www/gbif-split
  - chown -R tomcat7.tomcat7 /srv/vtatlasoflife.org/www/gbif-split.
  - IMPORTANT: MOVE 2 LARGEST FILES TO SUB-DIR BEFORE PROCESSING
    - 4fa7b334-ce0d-4e88-aaae-2e0c138d049e.zip (eBird)
    - 50c9509d-22c7-4a22-a47d-8c48425ef4a7.zip (iNat)
  - Process all others first, then move those two files back and process them individually (see below)
12) When (8) completes and (9) thru (11) are done, run the command below. (This will create/update all Data Resources in VAL in preparation for data ingestion.)
  - node 06_api_create_resources.js
13) Proceed with ingestion of all data on the VAL DE server. This is an ALA process with its own detailed steps, outlined here:
  - cd /data/biocache
  - ls -alh
  - mv load-all.out load-all-{date of loading}.out
  - ./load-all.sh
  - tail -f load-all.out (this command uses 4 threads, so optimized)
  - When load-all completes:
  - ./load-dr19.sh
  - ./load-dr1.sh
14) You may find that some historically-involved Data Resources no longer have data in Vermont. This should only happen
    with the correction of the GIS bounding-box used in the GBIF download query. It did happen on 2021-02-15 with the change
    to our GADM query. We found 23 datasets that are no longer valid:
    -


*/

exports.paths = {
  test_dwcaDir: "../dwca-small",
  test_splitDir: "../split-small",
  dwcaDir: "../dwca_gbif_2021-05-05",
  splitDir: "../split_2021-05-05",
  logDir: "../split_logs"
};

exports.urls = {
  primary:  "https://vtatlasoflife.org",
  collectory: "https://collectory.vtatlasoflife.org"
};
