{
 key: 'echo',
 parm: (args) => { return args.keyParmValue.parm.echo }, // Answer truthy if we are to just echo parameter back
 value: {
   func: (args) => { return args.keyParmValue.parm }, 
 },
 filename: 'e2e--echo-key.js',
}
