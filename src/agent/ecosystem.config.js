module.exports = {
  apps: [
    {
      name: 'cse-agent',
      script: 'dist/index.js',
      cwd: '/home/atheeque/workspace/cse-ai-dashboard/src/agent',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/agent-error.log',
      out_file: './logs/agent-out.log',
      merge_logs: true,
    },
  ],
};
