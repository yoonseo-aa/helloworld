package com.helloworld.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.util.List;

/**
 * Redis 설정. 좋아요/팔로우 카운트·관계 Set의 정본 저장소.
 * key/value 모두 String 직렬화 (좋아요 카운트 INCR/DECR, Set SADD/SREM 등에 적합).
 * Lua 스크립트 실행은 redisTemplate.execute(RedisScript, keys, args)로.
 */
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, String> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        StringRedisSerializer serializer = new StringRedisSerializer();
        template.setKeySerializer(serializer);
        template.setValueSerializer(serializer);
        template.setHashKeySerializer(serializer);
        template.setHashValueSerializer(serializer);
        return template;
    }

    /**
     * 좋아요 원자적 토글 Lua 스크립트 (resources/scripts/toggle_like.lua).
     * KEYS[1]=대상별 좋아요 users Set 키, KEYS[2]=count 키로 범용적이라 게시물/댓글 좋아요 양쪽에서 재사용.
     * 반환값이 [liked, count] 2개짜리 Lua 테이블이라 resultType은 List로 받는다.
     */
    @Bean
    public RedisScript<List> toggleLikeScript() {
        return RedisScript.of(new ClassPathResource("scripts/toggle_like.lua"), List.class);
    }
}
