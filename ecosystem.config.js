module.exports = {
  apps: [
    {
      name: 'cse-backend',
      cwd: './src/backend',
      script: 'npm',
      args: 'run start:dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 4101,
      },
      out_file: '../../logs/backend-out.log',
      error_file: '../../logs/backend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'cse-frontend',
      cwd: './src/frontend',
      script: 'npm',
      args: 'run dev -- -p 4100',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 4100,
      },
      out_file: '../../logs/frontend-out.log',
      error_file: '../../logs/frontend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
