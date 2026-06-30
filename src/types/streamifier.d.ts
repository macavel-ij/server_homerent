declare module "streamifier" {
  function createReadStream(buffer: Buffer): NodeJS.ReadableStream;
  function createWriteStream(): NodeJS.WritableStream;

  const streamifier: {
    createReadStream: typeof createReadStream;
    createWriteStream: typeof createWriteStream;
  };

  export = streamifier;
}
