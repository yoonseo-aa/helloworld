package com.helloworld.domain.badge.entity;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 배지 판정에 쓰이는 사용자별 지표. 4축을 한 번의 쿼리로 채운다.
 *
 * <p>축마다 따로 조회하면 프로필 한 번 열 때 쿼리가 4번 나간다. 어차피 전부 같은 사용자의
 * 단순 집계라 서브쿼리 하나로 묶는 편이 낫다.
 *
 * <p>record가 아니라 세터가 있는 클래스인 이유는 MyBatis 매핑 관례를 따르기 위해서다
 * ({@code PostTagRow}, {@code GithubStats}와 동일). 판정 로직은 이 객체를 읽기만 한다.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BadgeMetrics {

    /** 작성한 공개 게시글 수. */
    private int postCount;

    /** 자기 공개 게시글이 받은 좋아요 합계. */
    private int receivedLikes;

    /** 작성한 댓글 수 (삭제된 것 제외). */
    private int commentCount;

    /** 최근 1년간 커밋한 날 수. GitHub 미연동이면 0. */
    private int activeDays;

    /** GitHub 미연동이거나 활동이 전혀 없는 사용자도 4축이 모두 판정되도록 0으로 채운다. */
    public static BadgeMetrics empty() {
        return new BadgeMetrics(0, 0, 0, 0);
    }
}
