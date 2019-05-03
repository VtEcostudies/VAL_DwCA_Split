File: occurrence_split.js

Purpose:
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

Notes:
  dataset/provider eml is stored as /dataset/datasetKey.xml and referenced in
  occurrence.txt in the field named datasetKey.

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

Purpose:
Parse aggregate GBIF download DWcA into individual datasets/providers.
Goal being then to ingest each dataset into VAL as a seprate data resource.

Split verbatim.txt into datasetKey directories using gbifId-to-datesetKey
array-in-file generated from processing occurrence.txt, which contains the
only link between gbifId and datasetKey.

Assumptions:
- dwca_split has successfully run against occurrence.txt.
- gbifIds in verbatim.txt are a subset of those in occurrence.txt
- gbifIds uniquely map to a single GBIF datasetKey

File: multimedia_split.js

Purpose:
Parse aggregate GBIF download DWcA into individual datasets/providers.
Goal being then to ingest each dataset into VAL as a seprate data resource.

Specifics:
Split multimedia.txt into datasetKey directories using gbifId-to-datesetKey
array-in-file generated from processing occurrence.txt, which contains the
only link between gbifId and datasetKey.

Assumptions:
- dwca_split has successfully run against occurrence.txt.
- gbifIds in multimedia.txt are a subset of those in occurrence.txt
- gbifIds uniquely map to a single GBIF datasetKey
