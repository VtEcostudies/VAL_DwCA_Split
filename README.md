Project: gbif_dwca_split

Purpose:
  1) Parse aggregate GBIF download DWcA into individual datasets/providers.
  2) Using processed files from (1), parse metadata, citations, etc. into files pertaining just
  to their dataset's data into separate folders named 'datasetKey'.
  3) Using processed files from (1), parse verbatim.txt similar to occurrence.txt.
  4) Use GBIF API and each datasetKey to POST/PUT separate data resources to LA Collectory.
  5) Upload zipped DwCA to public folder on target LA node for use by biocache-ingest.

Notes:
  dataset/provider eml is stored as /dataset/datasetKey.xml and referenced in
  occurrence.txt in the field named datasetKey.

File: occurrence_split.js

Specifics:
- Parse occurrence.txt by '\n' terminated line looking for datasetKey
- Create a directory from each datasetKey with dataset sub-dir eg. datasetKey/dataset
- Copy ./dataset/datasetKey.xml to ./datsetKey/dataset/datasetKey.xml
- Copy ./meta.xml to ./datasetKey/meta.xml
- Copy ./metadata.xml to ./datasetKey/metadata.xml
- Copy ./rights.txt to ./datasetKey/rights.txt (TODO: clean to just its own dataset provider)
- Copy ./citations.txt to ./datasetKey/citations.txt (TODO: clean to just its own dataset provider)
- Create a new occurrence.txt in the ./datasetKey directory with just occurrences
  for that datasetKey
- Create an array like gbifId=datasetKey and put into file gbifId_datasetKey.txt
- After processing occurrence.txt, use that array-in-file to process
  verbatim.txt and multimedia.txt into their datasetKey directories.
- Also create the inverse array, datasetKey=[gbifId,gbifId,...] and put into file
  called datasetKey_gbifArray.txt.
- For each new datasetKey in occurrence.txt repeat the above steps

File: verbatim_split.js

Specifics:
- Split verbatim.txt into datasetKey directories using gbifId-to-datesetKey
array-in-file generated from processing occurrence.txt, which contains the
only link between gbifId and datasetKey.

Assumptions:
- occurrence_split has successfully run against occurrence.txt.
- gbifIds in verbatim.txt are a subset of those in occurrence.txt
- gbifIds uniquely map to a single GBIF datasetKey

File: multimedia_split.js

Specifics:
- Split multimedia.txt into datasetKey directories using gbifId-to-datesetKey
array-in-file generated from processing occurrence.txt, which contains the
only link between gbifId and datasetKey.

Assumptions:
- occurrence_split has successfully run against occurrence.txt.
- gbifIds in multimedia.txt are a subset of those in occurrence.txt
- gbifIds uniquely map to a single GBIF datasetKey

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

File: api_create_resources.js

Specifics:
- use config.js to define a local folder holding source data, remote url hosting collectory API
- use local datasetKey_gbifArray.txt to iterate over datasetKeys and create a local array
- call GBIF API for datasetKey dependent data (not all was added to the original aggregate download)
- Create (POST) or Update (PUT) LA Collectory Resources from datasetKey data gather from GBIF
- Zip DwCA dataset files into archive named 'datasetKey.zip'
- Upload DwCA archive to LA Collectory node public folder (eg. 'gbif_split')

ToDo:
- zip DwCA dataset files into archive named 'datasetKey.zip'
- upload data file to the server for ingestion

Notes:
For each datasetKey, POST/PUT to the VAL API:

val-docker (spring of 2019):
http://beta.vtatlasoflife.org/collectory/ws/{resourceType}/{typeId}

val-ansible-production (fall of 2019):
https://collectory.vtatlasoflife.org/ws/{}/{}

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