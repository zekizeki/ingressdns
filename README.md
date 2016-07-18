# ingress dns

This code looks for ingress controllers and then adds an entry to a consul server so that the ingress point has a DNS entry.

Define a replication controller for ingress DNS

```
apiVersion: v1
kind: ReplicationController
metadata:
  name: router
spec:
  replicas: 1
  selector:
    name: router
  template:
    metadata:
      labels:
        name: router
    spec:
      containers:
      - name: ingressdns
        image: zekizeki/ingressdns:0.0.1
        env:
          - name: KUBE_API_URL
            value: "http://kubernetes"
          - name: DOMAIN
            value: service.consul
          - name: CONSUL_API_ADDRESS
            value: http://localhost:8500/v1/agent/service/register
```

# Create the ingressdns rc

```
kubectl create -f ingressdns.yaml
```


The host name used in an ingress must be made up of 4 portions and end in service.consul (unless consul has been configured to use a different domain label)

e.g.    myservice.myenv.service.consul

an option HOST_REGEX env variable may be passed to add extra validation around the hostname used in an ingress. If the regex is not matched the host name will not be added to consul.

e.g. The following would validate that the host name used only used alpha numerics and ended with service.consul

```
- name: HOST_REGEX
  value: '^[aA0-zZ9]*\.[aA0-zZ9]*\.service.consul$'
```


