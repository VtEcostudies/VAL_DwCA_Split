/*
"acceptedNameUsageID","scientificNameID","parentNameUsageID","originalNameUsageID","nameAccordingToID","namePublishedInID",
"taxonConceptID","scientificName","acceptedNameUsage","parentNameUsage","originalNameUsage","nameAccordingTo",
"namePublishedIn","namePublishedInYear","higherClassification",
"kingdom","phylum","class","order","family","subfamily","genus","genericName","subgenus",
"infragenericEpithet","specificEpithet","infraspecificEpithet","cultivarEpithet",
"taxonRank","verbatimTaxonRank","vernacularName","nomenclaturalCode","taxonomicStatus","nomenclaturalStatus","taxonRemarks"
"taxonRemarks",
*/

COPY (
SELECT DISTINCT ON ("taxonKey") -- https://www.postgresql.org/docs/current/sql-select.html#SQL-DISTINCT
"scientificName","acceptedScientificName","taxonRank","taxonomicStatus",
occurrence_filtered."taxonKey","acceptedTaxonKey","kingdomKey","phylumKey","classKey","orderKey","familyKey","genusKey","subgenusKey","speciesKey",
"kingdom","phylum","class","order","family","subfamily","genus","genericName","subgenus","species",
"infragenericEpithet","specificEpithet","infraspecificEpithet","cultivarEpithet",
"vernacularName","taxonRemarks","nomenclaturalCode","nomenclaturalStatus"
FROM occurrence_filtered 
)
TO 'C:\Users\jtloo\Documents\VCE\VAL_Data_Pipelines\VAL_NameIndex\repo\database\export\val_species_from_occs.csv'
--TO 'C:\Users\jtloo\Downloads\val_species_from_occs.csv'
WITH (FORMAT CSV, HEADER TRUE);
/*
NOTES
- Occurrences have IDs to Kingdom. Presusmably, then, there are occurrences at every taxon level.
- That leads to the question: which occ taxa to export as a starting point for new species index. Try all of them first.
- First pass is to look for distinct acceptedNameUsageIDs because scientificNameID is usually blank and taxonID is verbatim garbage.
  That's not all of them - SYNONYMS rows have acceptedID of the ACCEPTED taxon.
*/