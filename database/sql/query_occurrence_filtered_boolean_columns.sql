--select table_schema,table_name, column_name, data_type from information_schema.columns
select column_name from information_schema.columns
where (
	table_name='occurrence_filtered' and data_type='boolean'
	and column_name NOT LIKE 'has%'
);
