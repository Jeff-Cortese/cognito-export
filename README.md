# cognito-export

### Pull docker image
```shell
$ docker pull jeffcortese/cognito-export:0.0.1
```

### Run the image
```shell
$ docker run -it \
   --name cognito_export \
   -e AWS_ACCESS_ID=your_id_here \
   -e AWS_SECRET_KEY=your_key_here \
   -e stage=prod \
   -e region=us-west-2 \
   jeffcortese/cognito-export:0.0.1
```

### Get the data out of the container
```shell
$ docker cp cognito_expot:./data ./data
```

### Clean up
```shell
$ docker rm -f cognito_export
$ docker rmi jeffcortese/cognito-export:0.0.1
```
