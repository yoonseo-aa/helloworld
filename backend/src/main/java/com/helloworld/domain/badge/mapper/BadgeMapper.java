package com.helloworld.domain.badge.mapper;

import com.helloworld.domain.badge.entity.BadgeMetrics;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 배지 판정 지표 조회 (MyBatis).
 * SQL은 resources/mapper/badge/BadgeMapper.xml 에 작성.
 */
@Mapper
public interface BadgeMapper {

    /** 4축 지표를 한 번에 조회. 사용자가 없거나 활동이 전혀 없어도 0으로 채워진 값이 온다. */
    BadgeMetrics selectMetrics(@Param("userId") Long userId);
}
