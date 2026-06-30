module.exports = {
  apps: [
    {
      name: "real-estate",
      script: "npm",
      args: "run dev",
      shell: true,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
