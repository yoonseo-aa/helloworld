FROM jenkins/jenkins:lts-jdk17
USER root

# 배포 대상 EC2 호스트로 SSH 접속하기 위한 클라이언트만 설치
# (docker 명령은 컨테이너 안에서 직접 실행하지 않고, SSH로 호스트에 접속해서 실행함 -
#  Docker-in-Docker 소켓 마운트 방식은 bind mount 경로가 꼬이는 문제가 있어 이 방식을 사용)
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssh-client git && \
    rm -rf /var/lib/apt/lists/*

USER jenkins
