select cron.alter_job((select jobid from cron.job where jobname = 'up-pipeline'), schedule := '2-59/10 9-10 * * *');;
